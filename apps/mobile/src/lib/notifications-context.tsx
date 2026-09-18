"use client";

import { App } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";
import { Capacitor, type PermissionState } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAccountsSupabaseClient } from "@/lib/accounts-supabase-client";

interface UnreadListAlert {
  id: string;
  list_id: string;
  list_item_id: string;
  product_id: string;
}

interface NotificationsContextValue {
  pushEnabled: boolean;
  pushReady: boolean;
  pushAvailableOnDevice: boolean;
  pushPermissionState: PermissionState | null;
  notificationError: string | null;
  unreadCount: number;
  unreadListItemKeys: ReadonlySet<string>;
  setPushEnabled: (enabled: boolean) => Promise<boolean>;
  openNotificationSettings: () => Promise<void>;
  markListItemViewed: (listId: string, listItemId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const alertKey = (listId: string, listItemId: string) => `${listId}:${listItemId}`;

function isNativeIos(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const client = getAccountsSupabaseClient();
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushAvailableOnDevice, setPushAvailableOnDevice] = useState(false);
  const [pushPermissionState, setPushPermissionState] = useState<PermissionState | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState<UnreadListAlert[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const registeredTokenRef = useRef<string | null>(null);
  const viewedRequestsRef = useRef(new Set<string>());

  const refreshNotifications = useCallback(async () => {
    if (!client || !user) {
      setPushEnabledState(false);
      setUnreadAlerts([]);
      return;
    }

    const preferenceResult = await client
      .from("notification_preferences")
      .select("push_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (preferenceResult.error && process.env.NODE_ENV !== "production") {
      console.warn("[notifications] Could not load preference", preferenceResult.error.message);
    }
    const nextUnreadAlerts: UnreadListAlert[] = [];
    for (let offset = 0; ; offset += 500) {
      const unreadResult = await client
        .from("list_price_alert_events")
        .select("id,list_id,list_item_id,product_id")
        .is("viewed_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + 499);
      if (unreadResult.error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[notifications] Could not load unread updates", unreadResult.error.message);
        }
        return;
      }
      const page = (unreadResult.data ?? []) as UnreadListAlert[];
      nextUnreadAlerts.push(...page);
      if (page.length < 500) break;
    }

    setPushEnabledState(Boolean(preferenceResult.data?.push_enabled));
    setUnreadAlerts(nextUnreadAlerts);
  }, [client, user]);

  const refreshPushPermission = useCallback(async (): Promise<PermissionState | null> => {
    if (!isNativeIos()) {
      setPushPermissionState(null);
      return null;
    }
    try {
      const permission = await PushNotifications.checkPermissions();
      setPushPermissionState(permission.receive);
      return permission.receive;
    } catch {
      setPushPermissionState(null);
      return null;
    }
  }, []);

  const refreshPushReadiness = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/status", { cache: "no-store" });
      const result = response.ok ? await response.json() as { ready?: boolean } : null;
      setPushReady(result?.ready === true);
    } catch {
      setPushReady(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPushAvailableOnDevice(isNativeIos());
      void refreshPushReadiness();
      void refreshPushPermission();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshPushPermission, refreshPushReadiness]);

  useEffect(() => {
    if (!isNativeIos()) return;
    let cancelled = false;
    let appStateHandle: { remove: () => Promise<void> } | undefined;

    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      void refreshPushPermission();
      void refreshPushReadiness();
      void refreshNotifications();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else appStateHandle = handle;
    });

    return () => {
      cancelled = true;
      void appStateHandle?.remove();
    };
  }, [refreshNotifications, refreshPushPermission, refreshPushReadiness]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshNotifications(), 0);
    if (!user) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    const timer = window.setInterval(refreshWhenVisible, 120_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshNotifications, user]);

  // Taps on a system notification always route into the list named in the
  // APNs payload. Only the list route is opened; its query params identify
  // the affected list and product for an in-app scroll target.
  useEffect(() => {
    if (!isNativeIos()) return;
    let cancelled = false;
    let actionHandle: { remove: () => Promise<void> } | undefined;
    let receivedHandle: { remove: () => Promise<void> } | undefined;

    void Promise.all([
      PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const data = notification.data as { listId?: unknown; productId?: unknown } | undefined;
        const target = new URL("/lists", window.location.origin);
        if (typeof data?.listId === "string") target.searchParams.set("listId", data.listId);
        if (typeof data?.productId === "string") target.searchParams.set("productId", data.productId);
        window.location.assign(target.toString());
      }),
      PushNotifications.addListener("pushNotificationReceived", () => {
        void refreshNotifications();
      }),
    ]).then(([action, received]) => {
      if (cancelled) {
        void action.remove();
        void received.remove();
      } else {
        actionHandle = action;
        receivedHandle = received;
      }
    });

    return () => {
      cancelled = true;
      void actionHandle?.remove();
      void receivedHandle?.remove();
    };
  }, [refreshNotifications]);

  // If a preference is already on, re-register on launch so iOS can rotate
  // APNs tokens and the current account always has a fresh device address.
  useEffect(() => {
    if (!client || !user || !pushEnabled || pushPermissionState !== "granted" || !isNativeIos()) return;
    let cancelled = false;
    let registrationHandle: { remove: () => Promise<void> } | undefined;
    let errorHandle: { remove: () => Promise<void> } | undefined;

    void Promise.all([
      PushNotifications.addListener("registration", ({ value }) => {
        if (cancelled || registeredTokenRef.current === value) return;
        registeredTokenRef.current = value;
        void client.rpc("register_push_device", { p_token: value, p_platform: "ios" }).then(({ error }) => {
          if (error) setNotificationError("We couldn't finish setting up push notifications. Please try again.");
        });
      }),
      PushNotifications.addListener("registrationError", ({ error: registrationError }) => {
        console.error("[notifications] APNs device registration failed", registrationError);
        if (!cancelled) setNotificationError("We couldn't register this device for notifications. Please try again.");
      }),
    ]).then(async ([registration, error]) => {
      if (cancelled) {
        void registration.remove();
        void error.remove();
        return;
      }
      registrationHandle = registration;
      errorHandle = error;
      try {
        await PushNotifications.register();
      } catch {
        if (!cancelled) setNotificationError("We couldn't register this device for notifications. Please try again.");
      }
    });

    return () => {
      cancelled = true;
      registeredTokenRef.current = null;
      void registrationHandle?.remove();
      void errorHandle?.remove();
    };
  }, [client, pushEnabled, pushPermissionState, user]);

  const setPushEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!client || !user) {
      setNotificationError("Sign in to manage push notifications.");
      return false;
    }
    if (enabled && !isNativeIos()) {
      setNotificationError("Push notifications are available in the iOS app.");
      return false;
    }
    if (enabled && !pushReady) {
      setNotificationError("Push alerts aren't ready yet. Please try again later.");
      return false;
    }

    setNotificationError(null);
    if (enabled) {
      try {
        let permission = await PushNotifications.checkPermissions();
        setPushPermissionState(permission.receive);
        if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
          permission = await PushNotifications.requestPermissions();
          setPushPermissionState(permission.receive);
        }
        if (permission.receive !== "granted") {
          return false;
        }
      } catch {
        setNotificationError("We couldn't check notification permissions on this device.");
        return false;
      }
    }

    const { error } = await client.rpc("set_push_notifications_enabled", { p_enabled: enabled });
    if (error) {
      setNotificationError("We couldn't update your notification setting. Please try again.");
      return false;
    }
    setPushEnabledState(enabled);

    if (!enabled) {
      await client.rpc("unregister_push_devices");
      registeredTokenRef.current = null;
    }
    return true;
  }, [client, pushReady, user]);

  const openNotificationSettings = useCallback(async () => {
    setNotificationError(null);
    try {
      const result = await AppLauncher.openUrl({ url: "app-settings:" });
      if (!result.completed) {
        setNotificationError("We couldn't open iPhone Settings. Open Settings and find Dodgy Deal to allow notifications.");
      }
    } catch {
      setNotificationError("We couldn't open iPhone Settings. Open Settings and find Dodgy Deal to allow notifications.");
    }
  }, []);

  const markListItemViewed = useCallback(async (listId: string, listItemId: string) => {
    if (!client || !user) return;
    const key = alertKey(listId, listItemId);
    if (!unreadAlerts.some((alert) => alert.list_id === listId && alert.list_item_id === listItemId)) return;
    if (viewedRequestsRef.current.has(key)) return;
    viewedRequestsRef.current.add(key);

    const { error } = await client.rpc("mark_list_price_alert_viewed", {
      p_list_id: listId,
      p_list_item_id: listItemId,
    });
    if (error) {
      viewedRequestsRef.current.delete(key);
      return;
    }
    setUnreadAlerts((current) => current.filter((alert) => !(alert.list_id === listId && alert.list_item_id === listItemId)));
  }, [client, unreadAlerts, user]);

  const unreadListItemKeys = useMemo(
    () => new Set(unreadAlerts.map((alert) => alertKey(alert.list_id, alert.list_item_id))),
    [unreadAlerts]
  );

  const value = useMemo<NotificationsContextValue>(() => ({
    pushEnabled,
    pushReady,
    pushAvailableOnDevice,
    pushPermissionState,
    notificationError,
    unreadCount: unreadAlerts.length,
    unreadListItemKeys,
    setPushEnabled,
    openNotificationSettings,
    markListItemViewed,
    refreshNotifications,
  }), [
    markListItemViewed,
    notificationError,
    openNotificationSettings,
    pushEnabled,
    pushAvailableOnDevice,
    pushReady,
    pushPermissionState,
    refreshNotifications,
    setPushEnabled,
    unreadAlerts.length,
    unreadListItemKeys,
  ]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used within NotificationsProvider");
  return context;
}
