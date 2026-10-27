import {
  createSupabaseClient,
  detectWatchlistPriceAlert,
  isWatchlistObservationFresh,
  type WatchlistVerdict,
} from "@dodgey-deals/shared";
import { accountsConfig } from "@/lib/accounts-config";
import { supabaseConfig } from "@/lib/config";
import { isApnsConfigured, sendApnsAlert } from "@/lib/apns";
import { getCurrentPremiumAccountIds, type PremiumEntitlementForNotifications } from "@/lib/notification-entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const PUSH_CLAIM_LEASE_MS = 15 * 60 * 1000;

interface ListRow {
  id: string;
  user_id: string;
  name: string;
}

interface ListItemRow {
  id: string;
  list_id: string;
  product_id: string;
}

interface CurrentPriceRow {
  product_id: string;
  store_id: string;
  price: number;
  is_special: boolean | null;
  updated_at: string;
}

interface PublishedSpecialRow {
  product_id: string;
  store_id: string;
  product_name: string;
  store_name: string;
  sale_price: number;
  verdict: "GENUINE" | "DODGY" | "MARGINAL" | "UNKNOWN";
}

interface AlertStateRow {
  list_item_id: string;
  store_id: string;
  last_price: number;
  last_is_special: boolean;
  last_verdict: WatchlistVerdict | null;
  last_observed_at: string;
  last_notified_price: number | null;
  last_notified_at: string | null;
}

interface PreferenceRow {
  user_id: string;
  push_enabled: boolean;
  push_enabled_at: string | null;
}

type EntitlementRow = PremiumEntitlementForNotifications;

interface DeviceRow {
  user_id: string;
  token: string;
}

interface AlertEventRow {
  id: string;
  user_id: string;
  list_id: string;
  list_item_id: string;
  product_id: string;
  product_name: string;
  store_id: string;
  store_name: string;
  event_type: "returned_to_special" | "better_special_price" | "became_real_saver" | "became_dodgy" | "dodgy_special";
  price: number;
  previous_price: number;
  verdict: WatchlistVerdict;
  event_key: string;
  created_at: string;
  viewed_at: string | null;
  push_sent_at: string | null;
  push_claimed_at: string | null;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

async function fetchPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await fetchPage(offset, offset + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function priceKey(productId: string, storeId: string): string {
  return `${productId}:${storeId}`;
}

function buildAlertCopy(events: AlertEventRow[], list: ListRow): {
  title: string;
  body: string;
  productId: string;
} {
  const bestByProduct = new Map<string, AlertEventRow>();
  for (const event of events) {
    const current = bestByProduct.get(event.product_id);
    if (!current || event.price < current.price) bestByProduct.set(event.product_id, event);
  }
  const products = [...bestByProduct.values()];

  if (products.length > 1) {
    const dodgyCount = products.filter((event) => event.event_type === "became_dodgy" || event.event_type === "dodgy_special").length;
    const realSaverCount = products.filter((event) => event.event_type === "became_real_saver").length;
    return {
      title: `${list.name} Watchlist update`,
      body: dodgyCount > 0
        ? `${dodgyCount === 1 ? "One watched item is" : `${dodgyCount} watched items are`} now Dodgy. Don’t buy. Tap to review.`
        : realSaverCount > 0
          ? `${realSaverCount === 1 ? "One watched item is" : `${realSaverCount} watched items are`} now Real Savers. Tap to review.`
          : `${products.length} watched items have new special-price updates. Tap to review.`,
      productId: products[0].product_id,
    };
  }

  const event = products[0];
  const price = `$${Number(event.price).toFixed(2)}`;
  const savings = `$${Math.max(0, Number(event.previous_price) - Number(event.price)).toFixed(2)}`;
  let body: string;
  if (event.event_type === "became_dodgy" || event.event_type === "dodgy_special") {
    body = `${event.product_name} at ${event.store_name} is now Dodgy at ${price}. Don’t buy it. Tap to review.`;
  } else if (event.event_type === "became_real_saver") {
    body = `${event.product_name} at ${event.store_name} is now a Real Saver at ${price}. Safe to buy. Tap to review.`;
  } else if (event.verdict !== "GENUINE") {
    body = `Price update: ${event.product_name} is ${price} at ${event.store_name}. Tap to view ${list.name}.`;
  } else if (event.event_type === "returned_to_special") {
    body = `${event.product_name} is back on special at ${event.store_name} for ${price}, down ${savings}. Tap to view ${list.name}.`;
  } else {
    body = `${event.product_name} is now ${price} at ${event.store_name}, ${savings} less. Tap to view ${list.name}.`;
  }

  return {
    title: `${list.name} price update`,
    body,
    productId: event.product_id,
  };
}

async function processAlerts(): Promise<Record<string, number | boolean>> {
  const serviceKey = process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY is not configured");
  if (!accountsConfig.url || !supabaseConfig.url || !supabaseConfig.anonKey) {
    throw new Error("Supabase configuration is incomplete");
  }

  const accounts = createSupabaseClient(accountsConfig.url, serviceKey);
  const catalogue = createSupabaseClient(supabaseConfig.url, supabaseConfig.anonKey);
  const lists = await fetchPages<ListRow>((from, to) =>
    accounts.from("lists").select("id,user_id,name").range(from, to)
  );
  const listItems = await fetchPages<ListItemRow>((from, to) =>
    accounts.from("list_items").select("id,list_id,product_id").range(from, to)
  );
  if (listItems.length === 0) return { lists: lists.length, items: 0, created: 0, delivered: 0, apnsConfigured: isApnsConfigured() };

  const listById = new Map(lists.map((list) => [list.id, list]));
  const productIds = [...new Set(listItems.map((item) => item.product_id))];
  const itemIds = listItems.map((item) => item.id);
  const priceRows: CurrentPriceRow[] = [];
  const specialRows: PublishedSpecialRow[] = [];

  for (const productChunk of chunks(productIds, 100)) {
    const [pricesResult, specialsResult] = await Promise.all([
      catalogue
        .from("current_prices")
        .select("product_id,store_id,price,is_special,updated_at")
        .in("product_id", productChunk),
      catalogue
        .from("published_dodgy_deals_cache")
        .select("product_id,store_id,product_name,store_name,sale_price,verdict")
        .in("product_id", productChunk),
    ]);
    if (pricesResult.error) throw new Error(`Could not read current prices: ${pricesResult.error.message}`);
    if (specialsResult.error) throw new Error(`Could not read verified specials: ${specialsResult.error.message}`);
    priceRows.push(...((pricesResult.data ?? []) as CurrentPriceRow[]));
    specialRows.push(...((specialsResult.data ?? []) as PublishedSpecialRow[]));
  }

  const stateRows: AlertStateRow[] = [];
  for (const itemChunk of chunks(itemIds, 100)) {
    const { data, error } = await accounts
      .from("list_price_alert_state")
      .select("list_item_id,store_id,last_price,last_is_special,last_verdict,last_observed_at,last_notified_price,last_notified_at")
      .in("list_item_id", itemChunk);
    if (error) throw new Error(`Could not read notification state: ${error.message}`);
    stateRows.push(...((data ?? []) as AlertStateRow[]));
  }

  const stateByKey = new Map(stateRows.map((row) => [`${row.list_item_id}:${row.store_id}`, row]));
  const specialByPriceKey = new Map(specialRows.map((row) => [priceKey(row.product_id, row.store_id), row]));
  const itemsByProduct = new Map<string, ListItemRow[]>();
  for (const item of listItems) {
    const group = itemsByProduct.get(item.product_id) ?? [];
    group.push(item);
    itemsByProduct.set(item.product_id, group);
  }

  const now = Date.now();
  const nextStates: AlertStateRow[] = [];
  const newEvents: Omit<AlertEventRow, "id" | "created_at" | "viewed_at" | "push_sent_at" | "push_claimed_at">[] = [];
  for (const price of priceRows) {
    const linkedSpecial = specialByPriceKey.get(priceKey(price.product_id, price.store_id));
    const observationIsFresh = isWatchlistObservationFresh(price.updated_at, now);
    const isVerifiedSpecial = Boolean(
      observationIsFresh &&
      price.is_special &&
      linkedSpecial &&
      Math.abs(Number(linkedSpecial.sale_price) - Number(price.price)) < 0.01
    );
    const listProductItems = itemsByProduct.get(price.product_id) ?? [];

    for (const item of listProductItems) {
      const key = `${item.id}:${price.store_id}`;
      const previous = stateByKey.get(key);
      const previousIsFresh = previous && isWatchlistObservationFresh(previous.last_observed_at, now);
      let eventType: AlertEventRow["event_type"] | null = null;
      const currentPrice = Number(price.price);

      eventType = detectWatchlistPriceAlert({
        previous,
        previousIsFresh: Boolean(previousIsFresh),
        currentPrice,
        isVerifiedSpecial,
        verdict: linkedSpecial?.verdict,
      });

      const list = listById.get(item.list_id);
      if (eventType && linkedSpecial && list) {
        const previousPrice = eventType === "better_special_price"
          ? Number(previous?.last_notified_price ?? previous?.last_price ?? currentPrice)
          : Number(previous?.last_price ?? currentPrice);
        const eventKey = [item.id, price.store_id, eventType, currentPrice.toFixed(2), previous?.last_observed_at ?? "baseline", price.updated_at].join(":");
        newEvents.push({
          user_id: list.user_id,
          list_id: list.id,
          list_item_id: item.id,
          product_id: item.product_id,
          product_name: linkedSpecial.product_name,
          store_id: price.store_id,
          store_name: linkedSpecial.store_name,
          event_type: eventType,
          price: currentPrice,
          previous_price: previousPrice,
          verdict: linkedSpecial.verdict,
          event_key: eventKey,
        });
      }

      const didNotify = Boolean(eventType && linkedSpecial && list);
      nextStates.push({
        list_item_id: item.id,
        store_id: price.store_id,
        last_price: currentPrice,
        last_is_special: isVerifiedSpecial,
        last_verdict: isVerifiedSpecial ? linkedSpecial?.verdict ?? null : previous?.last_verdict ?? null,
        last_observed_at: price.updated_at,
        last_notified_price: didNotify ? currentPrice : previous?.last_notified_price ?? null,
        last_notified_at: didNotify ? new Date(now).toISOString() : previous?.last_notified_at ?? null,
      });
    }
  }

  let created = 0;
  for (const eventChunk of chunks(newEvents, 200)) {
    if (!eventChunk.length) continue;
    const { data, error } = await accounts
      .from("list_price_alert_events")
      .upsert(eventChunk, { onConflict: "event_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Could not save list-price updates: ${error.message}`);
    created += data?.length ?? 0;
  }

  for (const stateChunk of chunks(nextStates, 500)) {
    if (!stateChunk.length) continue;
    const { error } = await accounts
      .from("list_price_alert_state")
      .upsert(stateChunk, { onConflict: "list_item_id,store_id" });
    if (error) throw new Error(`Could not update price-monitoring state: ${error.message}`);
  }

  let delivered = 0;
  let premiumUsers = 0;
  let filteredFreeUsers = 0;
  if (isApnsConfigured()) {
    const preferences = await fetchPages<PreferenceRow>((from, to) =>
      accounts
        .from("notification_preferences")
        .select("user_id,push_enabled,push_enabled_at")
        .eq("push_enabled", true)
        .range(from, to)
    );
    const preferenceUserIds = [...new Set(preferences.map((preference) => preference.user_id))];
    const entitlementRows: EntitlementRow[] = [];
    for (const userIdChunk of chunks(preferenceUserIds, 100)) {
      if (!userIdChunk.length) continue;
      const { data, error } = await accounts
        .from("subscription_entitlements")
        .select("account_id,entitlement_key,status,expires_at")
        .eq("entitlement_key", "premium_access")
        .in("account_id", userIdChunk);
      if (error) throw new Error(`Could not read notification entitlements: ${error.message}`);
      entitlementRows.push(...((data ?? []) as EntitlementRow[]));
    }
    const premiumUserIds = getCurrentPremiumAccountIds(entitlementRows, new Date(now));
    const eligiblePreferences = preferences.filter((preference) => premiumUserIds.has(preference.user_id));
    const userIds = [...new Set(eligiblePreferences.map((preference) => preference.user_id))];
    premiumUsers = userIds.length;
    filteredFreeUsers = preferenceUserIds.length - premiumUsers;

    if (userIds.length) {
      const devices: DeviceRow[] = [];
      const pendingEvents: AlertEventRow[] = [];
      for (const userIdChunk of chunks(userIds, 100)) {
        const [devicesPage, pendingPage] = await Promise.all([
          fetchPages<DeviceRow>((from, to) =>
            accounts.from("push_devices").select("user_id,token").in("user_id", userIdChunk).range(from, to)
          ),
          fetchPages<AlertEventRow>((from, to) =>
            accounts
              .from("list_price_alert_events")
              .select("id,user_id,list_id,list_item_id,product_id,product_name,store_id,store_name,event_type,price,previous_price,verdict,event_key,created_at,viewed_at,push_sent_at,push_claimed_at")
              .in("user_id", userIdChunk)
              .is("push_sent_at", null)
              .is("viewed_at", null)
              .gte("created_at", new Date(now - 48 * 60 * 60 * 1000).toISOString())
              .range(from, to)
          ),
        ]);
        devices.push(...devicesPage);
        pendingEvents.push(...pendingPage);
      }
      const devicesByUser = new Map<string, DeviceRow[]>();
      for (const device of devices) {
        const group = devicesByUser.get(device.user_id) ?? [];
        group.push(device);
        devicesByUser.set(device.user_id, group);
      }

      const preferenceByUser = new Map(eligiblePreferences.map((preference) => [preference.user_id, preference]));
      const listsByUserAndId = new Map(lists.map((list) => [`${list.user_id}:${list.id}`, list]));
      const pendingGroups = new Map<string, AlertEventRow[]>();
      const claimBefore = new Date(now - PUSH_CLAIM_LEASE_MS).getTime();
      for (const event of pendingEvents) {
        const preference = preferenceByUser.get(event.user_id);
        if (!preference?.push_enabled_at || Date.parse(event.created_at) < Date.parse(preference.push_enabled_at)) continue;
        const claimedAt = event.push_claimed_at ? Date.parse(event.push_claimed_at) : NaN;
        if (Number.isFinite(claimedAt) && claimedAt >= claimBefore) continue;
        const key = `${event.user_id}:${event.list_id}`;
        const group = pendingGroups.get(key) ?? [];
        group.push(event);
        pendingGroups.set(key, group);
      }

      for (const [groupKey, events] of pendingGroups) {
        const [userId, listId] = groupKey.split(":");
        const list = listsByUserAndId.get(`${userId}:${listId}`);
        const devices = devicesByUser.get(userId) ?? [];
        if (!list || !devices.length || !events.length) continue;
        const claimAt = new Date(now).toISOString();
        const claimBeforeIso = new Date(now - PUSH_CLAIM_LEASE_MS).toISOString();
        const { data: claimedRows, error: claimError } = await accounts
          .from("list_price_alert_events")
          .update({ push_claimed_at: claimAt })
          .in("id", events.map((event) => event.id))
          .is("push_sent_at", null)
          .or(`push_claimed_at.is.null,push_claimed_at.lt.${claimBeforeIso}`)
          .select("id");
        if (claimError) throw new Error(`Could not claim pending push events: ${claimError.message}`);
        const claimedIds = new Set((claimedRows ?? []).map((row) => String(row.id)));
        const claimedEvents = events.filter((event) => claimedIds.has(event.id));
        if (!claimedEvents.length) continue;
        const copy = buildAlertCopy(claimedEvents, list);
        const payload = {
          // The system alert is audible when the app is backgrounded; the
          // bottom-nav/item badges remain the in-app signal when it is open.
          aps: {
            alert: { title: copy.title, body: copy.body },
            sound: "default",
            "thread-id": list.id,
          },
          listId: list.id,
          productId: copy.productId,
        };
        let deliveredToDevice = false;
        for (const device of devices) {
          const result = await sendApnsAlert(device.token, payload);
          if (result.ok) {
            deliveredToDevice = true;
          } else if (result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
            await accounts.from("push_devices").delete().eq("token", device.token);
          }
        }
        if (deliveredToDevice) {
          const eventIds = claimedEvents.map((event) => event.id);
          const { error } = await accounts
            .from("list_price_alert_events")
            .update({ push_sent_at: claimAt, push_claimed_at: null })
            .in("id", eventIds)
            .eq("push_claimed_at", claimAt);
          if (error) throw new Error(`Push was delivered but its status could not be saved: ${error.message}`);
          delivered += 1;
        } else {
          const { error } = await accounts
            .from("list_price_alert_events")
            .update({ push_claimed_at: null })
            .in("id", claimedEvents.map((event) => event.id))
            .eq("push_claimed_at", claimAt)
            .is("push_sent_at", null);
          if (error) throw new Error(`Push failed and its claim could not be released: ${error.message}`);
        }
      }
    }
  }

  return {
    lists: lists.length,
    items: listItems.length,
    created,
    delivered,
    premiumUsers,
    filteredFreeUsers,
    apnsConfigured: isApnsConfigured(),
  };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const scraperRunId = request.headers.get("x-scraper-run-id") ?? undefined;
  if (!secret) return Response.json({ error: "Notification processing is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAlerts();
    console.info("List-price notification processing completed.", { ...result, scraperRunId });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("List-price notification processing failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
      scraperRunId,
    });
    return Response.json({ error: "Notification processing failed." }, { status: 500 });
  }
}
