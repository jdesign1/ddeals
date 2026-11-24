"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PriceHistoryPoint } from "@dodgey-deals/shared";

type DealVerdict = "real" | "dodgy";
type DemoItemOrder = [number, number];
type DemoItemOrders = Record<string, DemoItemOrder>;

interface DemoItem {
  id: string;
  productId: string;
  storeId: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  store: string;
  price: number;
  imageUrl: string;
  verdict: DealVerdict;
  stats: {
    averagePrice: number | null;
    lowestPrice: number | null;
    daysTracked: number;
    priceChanges: number;
  };
}

interface DemoCase {
  id: string;
  items: [DemoItem, DemoItem];
}

interface GameDataResponse {
  cases?: DemoCase[];
}

interface HistoryResponse {
  points?: PriceHistoryPoint[];
}

const STORE_LOGOS: Record<string, { src: string; background: string }> = {
  woolworths: { src: "/store-logos/woolworths.svg", background: "#ffffff" },
  paknsave: {
    src: "https://au-images.contentstack.com/v3/assets/blt764dfa8e6eb818cb/blt8ee71f0335474ac5/69277547ac1a413bbe0f38d8/fs118378-pak-n-save-square.jpg?crop=408,306,x48,y100&width=128&height=96&format=webp&quality=80",
    background: "#ffed00",
  },
  newworld: {
    src: "https://au-images.contentstack.com/v3/assets/blt3febb09f1eb825b2/blt6c3a4fc231d04da8/693b4f616403dec744ab1b6f/nz-logo.jpg?crop=1100,1060,x200,y90&width=132&height=128&fit=bounds&format=webp&quality=80",
    background: "#ffffff",
  },
  foursquare: { src: "/store-logos/foursquare.svg", background: "#009639" },
  supervalue: { src: "/store-logos/supervalue.svg", background: "#d71920" },
};

const STORE_ALIASES: [string, string][] = [
  ["paknsave", "paknsave"],
  ["newworld", "newworld"],
  ["woolworth", "woolworths"],
  ["foursquare", "foursquare"],
  ["supervalue", "supervalue"],
];

function currency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}

function TapIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 11V5.75a1.5 1.5 0 0 1 3 0V11 8.75a1.5 1.5 0 0 1 3 0V11 9.75a1.5 1.5 0 0 1 3 0v5.1c0 3.4-2.3 5.65-5.7 5.65h-1.15c-1.45 0-2.8-.62-3.78-1.7L4.5 14.1a1.55 1.55 0 0 1 2.25-2.13L8.5 13.8V11Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function createItemOrders(cases: DemoCase[]): DemoItemOrders {
  return Object.fromEntries(cases.map(({ id }) => [id, Math.random() < 0.5 ? [0, 1] : [1, 0]])) as DemoItemOrders;
}

function RetailerBadge({ store }: { store: string }) {
  const [failed, setFailed] = useState(false);
  const normalized = store.toLowerCase().replace(/[^a-z]/g, "");
  const logoKey = STORE_ALIASES.find(([alias]) => normalized.includes(alias))?.[1];
  const logo = logoKey ? STORE_LOGOS[logoKey] : null;
  const initials = store.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  if (!logo || failed) return <span className="demo-retailer-mark demo-retailer-mark--fallback" aria-hidden="true">{initials}</span>;
  return (
    <span className={`demo-retailer-mark demo-retailer-mark--${logoKey}`} style={{ backgroundColor: logo.background }} aria-hidden="true">
      <Image src={logo.src} alt="" width={30} height={30} unoptimized onError={() => setFailed(true)} />
    </span>
  );
}

function ProductPhoto({ item, compact = false }: { item: DemoItem; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`real-deal-photo${compact ? " real-deal-photo--compact" : ""}`}>
      {!failed ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          width={compact ? 72 : 148}
          height={compact ? 72 : 148}
          sizes={compact ? "72px" : "(max-width: 720px) 112px, 148px"}
          unoptimized
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="real-deal-photo-fallback" aria-label={`${item.name} image unavailable`}>Image unavailable</span>
      )}
    </div>
  );
}

function PriceHistoryGraph({ item, points }: { item: DemoItem; points: PriceHistoryPoint[] }) {
  const chartNow = useMemo(() => Date.now(), [item.id, points]);
  const visiblePoints = useMemo(() => {
    const start = chartNow - 90 * 24 * 60 * 60 * 1000;
    const observed = points
      .filter((point) => point.price > 0 && Number.isFinite(point.price) && Number.isFinite(Date.parse(point.scrapedAt)))
      .slice()
      .sort((left, right) => Date.parse(left.scrapedAt) - Date.parse(right.scrapedAt));
    if (!observed.length) return [];

    const last = observed[observed.length - 1];
    const isCurrent = Math.abs(chartNow - Date.parse(last.scrapedAt)) <= 60_000
      && last.price === item.price
      && last.isSpecial;
    if (isCurrent) {
      observed[observed.length - 1] = { ...last, scrapedAt: new Date(chartNow).toISOString() };
    } else {
      observed.push({ price: item.price, isSpecial: true, scrapedAt: new Date(chartNow).toISOString() });
    }
    return observed.filter((point) => Date.parse(point.scrapedAt) <= chartNow && Date.parse(point.scrapedAt) >= start - 90 * 24 * 60 * 60 * 1000);
  }, [chartNow, item.price, points]);

  if (visiblePoints.length < 2) {
    return <p className="demo-history-unavailable">There isn’t enough recorded history to draw this graph yet.</p>;
  }

  const width = 360;
  const height = 210;
  const left = 68;
  const right = 344;
  const top = 10;
  const bottom = 164;
  const start = chartNow - 90 * 24 * 60 * 60 * 1000;
  const prices = visiblePoints.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const spread = maxPrice - minPrice;
  const padding = spread > 0 ? spread * 0.14 : Math.max(maxPrice * 0.12, 0.5);
  const yMin = Math.max(0, minPrice - padding);
  const yMax = maxPrice + padding;
  const yRange = yMax - yMin || 1;
  const xFor = (point: PriceHistoryPoint) => {
    const time = Math.min(chartNow, Math.max(start, Date.parse(point.scrapedAt)));
    return left + ((time - start) / (90 * 24 * 60 * 60 * 1000)) * (right - left);
  };
  const yFor = (price: number) => bottom - ((price - yMin) / yRange) * (bottom - top);
  const coordinates = visiblePoints.map((point) => ({ point, x: xFor(point), y: yFor(point.price) }));
  const linePath = coordinates.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const areaPath = `${linePath} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
  const gridValues = [yMax, yMin + yRange / 2, yMin];
  const verdictColor = item.verdict === "real" ? "var(--verdict-real)" : "var(--verdict-dodgy)";

  return (
    <div className="demo-history-chart-wrap">
      <svg
        className="demo-history-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`90-day price history for ${item.name} at ${item.store}`}
      >
        <defs>
          <linearGradient id="demo-history-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={verdictColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={verdictColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridValues.map((value, index) => {
          const y = top + ((bottom - top) / 2) * index;
          return (
            <g key={index}>
              <line x1={left} x2={right} y1={y} y2={y} className="demo-history-gridline" />
              <text x={left - 9} y={y + 4} textAnchor="end" className="demo-history-axis-price">{currency(value)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#demo-history-fade)" />
          <path d={linePath} className="demo-history-line" style={{ stroke: verdictColor }} />
        {coordinates.map(({ point, x, y }) => (
          <g key={`${point.scrapedAt}-${point.price}`}>
            <circle cx={x} cy={y} r="5" className={point.isSpecial ? "demo-history-point demo-history-point--special" : "demo-history-point"} />
            <title>{`${new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short" }).format(new Date(point.scrapedAt))}: ${currency(point.price)} · ${point.isSpecial ? "On special" : "Regular price"}`}</title>
          </g>
        ))}
        <text x={left} y={bottom + 28} textAnchor="start" className="demo-history-axis-label">90 days ago</text>
        <text x={right} y={bottom + 28} textAnchor="end" className="demo-history-axis-label">Today</text>
      </svg>
      <div className="demo-history-legend" aria-hidden="true">
        <span><i className="demo-history-legend-dot demo-history-legend-dot--special" />On special</span>
        <span><i className="demo-history-legend-dot" />Regular price</span>
      </div>
    </div>
  );
}

function CaseSkeleton() {
  return (
    <div className="real-deal-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading current supermarket specials</span>
      <div className="real-deal-loading-title" />
      <div className="real-deal-loading-grid">
        <div className="real-deal-loading-card"><div /><span /><i /><i /></div>
        <div className="real-deal-loading-card"><div /><span /><i /><i /></div>
      </div>
    </div>
  );
}

export default function RealDealGame() {
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [caseOrder, setCaseOrder] = useState<number[]>([]);
  const [itemOrders, setItemOrders] = useState<DemoItemOrders>({});
  const [casePosition, setCasePosition] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [caseKey, setCaseKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [historyPoints, setHistoryPoints] = useState<PriceHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const currentCase = cases[caseOrder[casePosition] ?? -1] ?? null;
  const currentItems = currentCase
    ? currentCase.items.map((_, index) => currentCase.items[itemOrders[currentCase.id]?.[index] ?? index])
    : [];
  const selectedItem = currentCase?.items.find((item) => item.id === selectedItemId) ?? null;
  const answered = selectedItem !== null;

  const loadCases = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/real-deal-cases", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Current cases could not be loaded");
      const payload = await response.json() as GameDataResponse;
      const nextCases = Array.isArray(payload.cases) ? payload.cases.filter((item) => item.items?.length === 2) : [];
      if (!nextCases.length) throw new Error("No current cases are available");
      setCases(nextCases);
      setCaseOrder(shuffle(nextCases.map((_, index) => index)));
      setItemOrders(createItemOrders(nextCases));
      setCasePosition(0);
      setSelectedItemId(null);
      setHistoryPoints([]);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    void loadCases(controller.signal);
    return () => controller.abort();
  }, [loadCases, shouldLoad]);

  useEffect(() => {
    if (!selectedItem) {
      setHistoryPoints([]);
      setHistoryLoading(false);
      setHistoryError(false);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ productId: selectedItem.productId, storeId: selectedItem.storeId });
    setHistoryLoading(true);
    setHistoryError(false);
    void fetch(`/api/real-deal-history?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("History could not be loaded");
        return response.json() as Promise<HistoryResponse>;
      })
      .then((payload) => setHistoryPoints(Array.isArray(payload.points) ? payload.points : []))
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== "AbortError") setHistoryError(true);
      })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [selectedItem?.id, selectedItem?.productId, selectedItem?.storeId]);

  useEffect(() => {
    if (caseKey > 0) questionRef.current?.focus();
  }, [caseKey]);

  const tryAnotherCase = () => {
    setSelectedItemId(null);
    if (casePosition < caseOrder.length - 1) {
      setCasePosition((position) => position + 1);
    } else {
      setCaseOrder(shuffle(cases.map((_, index) => index)));
      setItemOrders(createItemOrders(cases));
      setCasePosition(0);
    }
    setCaseKey((key) => key + 1);
  };

  const resetCase = () => {
    setSelectedItemId(null);
    setCaseKey((key) => key + 1);
  };

  const historyLow = selectedItem?.stats.lowestPrice ?? null;
  const currentHistoryStatement = selectedItem && historyLow !== null
    ? selectedItem.verdict === "real"
      ? selectedItem.price <= historyLow + 0.01
        ? "Today matches its lowest recorded price in the past 90 days."
        : selectedItem.stats.averagePrice != null && selectedItem.price < selectedItem.stats.averagePrice
          ? `Today’s special is ${currency(selectedItem.stats.averagePrice - selectedItem.price)} below its 90-day average.`
          : "Its 90-day price assessment confirms this is a Real Saver."
      : selectedItem.stats.averagePrice != null && selectedItem.price > selectedItem.stats.averagePrice
        ? `Today’s special is ${currency(selectedItem.price - selectedItem.stats.averagePrice)} above its 90-day average.`
        : `It has been as low as ${currency(historyLow)} in the past 90 days.`
    : selectedItem?.verdict === "real"
      ? "The price history assessment marks this as a Real Saver."
      : "The price history assessment marks this as a Dodgy Deal.";

  return (
    <section ref={sectionRef} className="real-deal-section" id="try-a-case" aria-labelledby="real-deal-title">
      <div className="real-deal-inner">
        <header className="real-deal-intro">
          <p className="real-deal-eyebrow">Try a case</p>
          <h2 id="real-deal-title">Which special is the real deal?</h2>
          <p>Pick the special you think is a genuine saving. Then check the item’s 90-day price history.</p>
        </header>

        <div className="real-deal-game-card">
          <div className="real-deal-card-topline">
            <span className="real-deal-case-number">
              {currentCase ? <>CASE {String(casePosition + 1).padStart(2, "0")} <span>OF {String(cases.length).padStart(2, "0")}</span></> : "TODAY’S SPECIALS"}
            </span>
            <span className="real-deal-sample-note">Real NZ products · real price history</span>
          </div>

          {loading ? <CaseSkeleton /> : loadError ? (
            <div className="real-deal-empty" role="status">
              <h3>Live specials aren’t available right now.</h3>
              <p>Try again in a moment to play with current supermarket products.</p>
              <button type="button" className="real-deal-button real-deal-button--primary" onClick={() => void loadCases()}>Try again</button>
            </div>
          ) : currentCase ? (
            <div key={caseKey} className="real-deal-case-content">
              <h3 ref={questionRef} tabIndex={-1} className="real-deal-question">Which item looks like a real saving?</h3>
              <div className="real-deal-choice-grid" role="group" aria-label="Choose the item you think is a real saving">
                {currentItems.map((item, index) => {
                  const isSelected = item.id === selectedItemId;
                  const isReal = item.verdict === "real";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`real-deal-choice${answered && isReal ? " is-real" : ""}${answered && isSelected && !isReal ? " is-dodgy-selected" : ""}`}
                      onClick={() => { if (!answered) setSelectedItemId(item.id); }}
                      disabled={answered}
                      aria-pressed={isSelected}
                      aria-label={`${String.fromCharCode(65 + index)}: ${item.brand ? `${item.brand} ` : ""}${item.name}, ${item.unit || "size not listed"}, ${currency(item.price)} at ${item.store}${answered ? `, ${isReal ? "Real Saver" : "Dodgy Deal"}` : ". Choose this special"}`}
                    >
                      <span className="real-deal-choice-letter">{String.fromCharCode(65 + index)}</span>
                      <ProductPhoto item={item} />
                      <span className="real-deal-choice-body">
                        <span className="real-deal-product-brand">{item.brand || item.category}</span>
                        <span className="real-deal-product-name">{item.name}</span>
                        {item.unit && <span className="real-deal-product-size">{item.unit}</span>}
                        <span className="real-deal-price">{currency(item.price)}</span>
                        <span className="real-deal-store-line"><RetailerBadge store={item.store} /> <span>{item.store}</span></span>
                        {answered && <span className={`real-deal-verdict real-deal-verdict--${item.verdict}`}>{isReal ? "Real Saver" : "Dodgy Deal"}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!answered ? (
                <p className="real-deal-prompt"><TapIcon /> Tap or click an item to reveal its price history</p>
              ) : selectedItem ? (
                <div className="real-deal-reveal">
                  <div className={`real-deal-result real-deal-result--${selectedItem.verdict}`} role="status" aria-live="polite">
                    <span className={`real-deal-result-icon real-deal-result-icon--${selectedItem.verdict}`} aria-hidden="true">
                      {selectedItem.verdict === "real" ? "✓" : "!"}
                    </span>
                    <div>
                      <h3>{selectedItem.verdict === "real" ? "Good eye — that’s a real saving." : "Close — the other item is the real saving."}</h3>
                      <p>{selectedItem.verdict === "real" ? "You picked the Real Saver." : "This one is a Dodgy Deal. Let’s see what its price history says."}</p>
                    </div>
                  </div>

                  <article className="demo-selected-product" aria-label={`${selectedItem.name} at ${selectedItem.store}`}>
                    <ProductPhoto item={selectedItem} compact />
                    <div className="demo-selected-product-copy">
                      <span className="real-deal-product-brand">{selectedItem.brand || selectedItem.category}</span>
                      <h4>{selectedItem.name}</h4>
                      {selectedItem.unit && <span className="real-deal-product-size">{selectedItem.unit}</span>}
                      <div className="demo-selected-product-footer">
                        <strong>{currency(selectedItem.price)}</strong>
                        <span className="real-deal-store-line"><RetailerBadge store={selectedItem.store} /> {selectedItem.store}</span>
                      </div>
                    </div>
                  </article>

                  <section className="demo-history-card" aria-labelledby="demo-history-title">
                    <h4 id="demo-history-title">90-day deal history</h4>
                    <div className="demo-history-stats" role="group" aria-label="90-day price history summary">
                      <div><strong>{selectedItem.stats.daysTracked}</strong><span>Days tracked</span></div>
                      <div><strong>{selectedItem.stats.priceChanges}</strong><span>Price changes</span></div>
                      <div><strong>{selectedItem.stats.averagePrice == null ? "—" : currency(selectedItem.stats.averagePrice)}</strong><span>Avg price</span></div>
                    </div>
                    {historyLoading ? (
                      <div className="demo-history-loading" role="status">Loading price history…</div>
                    ) : historyError ? (
                      <p className="demo-history-unavailable">Price history could not be loaded. Please try this case again.</p>
                    ) : (
                      <PriceHistoryGraph item={selectedItem} points={historyPoints} />
                    )}
                    <p className={`demo-history-evidence demo-history-evidence--${selectedItem.verdict}`}>{currentHistoryStatement}</p>
                  </section>

                  <div className="real-deal-actions">
                    <button type="button" className="real-deal-button real-deal-button--secondary" onClick={resetCase}>Try again</button>
                    <button type="button" className="real-deal-button real-deal-button--primary" onClick={tryAnotherCase}>Play next</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {answered && <p className="real-deal-download-prompt">Want to check your own specials? <a href="#top">Explore the Dodgy Deal app</a></p>}
      </div>
    </section>
  );
}
