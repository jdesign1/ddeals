export type CheckDealsSortBy = "price-asc" | "latest";

/** The sort choices shared by the Check Deals rail and full-screen search. */
export const CHECK_DEALS_SORT_OPTIONS: { value: CheckDealsSortBy; label: string }[] = [
  { value: "price-asc", label: "Lowest to highest price" },
  { value: "latest", label: "Latest specials" },
];
