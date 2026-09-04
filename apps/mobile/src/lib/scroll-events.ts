export const CHECK_DEALS_HEADER_SCROLL_EVENT = "dodgey-deals:check-deals-header-scroll";
export const CHECK_DEALS_SCROLL_POSITION_EVENT = "dodgey-deals:check-deals-scroll-position";
export const STICKY_BOTTOM_BOUNCE_GUARD_PX = 24;

/**
 * iOS can emit a short run of scroll events while rubber-banding at the
 * bottom of an overflow scroller. Those events can look like alternating
 * up/down movement to sticky toolbar reveal logic, even though the user has
 * not changed direction. Keep the guard shared by Check Deals and the
 * full-screen search so both sticky stacks treat the bottom edge alike.
 */
export function isNearScrollBottom(element: HTMLElement, scrollTop = element.scrollTop): boolean {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  return maxScrollTop > 0 && maxScrollTop - scrollTop <= STICKY_BOTTOM_BOUNCE_GUARD_PX;
}

export function publishCheckDealsHeaderVisibility(hidden: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<boolean>(CHECK_DEALS_HEADER_SCROLL_EVENT, { detail: hidden }));
}

export function subscribeToCheckDealsHeaderVisibility(onChange: (hidden: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    const hidden = (event as CustomEvent<boolean>).detail;
    if (typeof hidden === "boolean") onChange(hidden);
  };

  window.addEventListener(CHECK_DEALS_HEADER_SCROLL_EVENT, handleChange);
  return () => window.removeEventListener(CHECK_DEALS_HEADER_SCROLL_EVENT, handleChange);
}

export function publishCheckDealsScrollPosition(scrollTop: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<number>(CHECK_DEALS_SCROLL_POSITION_EVENT, { detail: scrollTop }));
}

export function subscribeToCheckDealsScrollPosition(onChange: (scrollTop: number) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    const scrollTop = (event as CustomEvent<number>).detail;
    if (typeof scrollTop === "number") onChange(scrollTop);
  };

  window.addEventListener(CHECK_DEALS_SCROLL_POSITION_EVENT, handleChange);
  return () => window.removeEventListener(CHECK_DEALS_SCROLL_POSITION_EVENT, handleChange);
}
