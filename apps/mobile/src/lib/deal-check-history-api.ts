import type { DealCheckRow } from "@dodgey-deals/shared";

export interface DealCheckHistoryApiOptions {
  scope: "history" | "stats";
  startAt?: string;
  endAt?: string;
}

interface DealCheckHistoryApiResponse {
  rows?: DealCheckRow[];
  isPremium?: boolean;
  limited?: boolean;
  error?: string;
}

export interface DealCheckHistoryResult {
  rows: DealCheckRow[];
  isPremium: boolean;
  limited: boolean;
}

export async function fetchDealCheckHistoryFromApi(
  accessToken: string,
  options: DealCheckHistoryApiOptions,
): Promise<DealCheckHistoryResult> {
  const params = new URLSearchParams({ scope: options.scope });
  if (options.startAt) params.set("startAt", options.startAt);
  if (options.endAt) params.set("endAt", options.endAt);

  const response = await fetch(`/api/deal-checks/history?${params.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null) as DealCheckHistoryApiResponse | null;
  if (!response.ok) throw new Error(payload?.error || "We could not load your deal history.");
  return {
    rows: payload?.rows ?? [],
    isPremium: payload?.isPremium === true,
    limited: payload?.limited === true,
  };
}
