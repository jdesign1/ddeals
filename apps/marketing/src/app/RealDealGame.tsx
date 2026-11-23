"use client";

import { useEffect, useRef, useState } from "react";

type ProductIllustration = "butter" | "coffee" | "eggs" | "cereal" | "bread" | "biscuits";
type DealVerdict = "real" | "dodgy";

interface DemoItem {
  id: string;
  name: string;
  size: string;
  store: string;
  price: number;
  verdict: DealVerdict;
  illustration: ProductIllustration;
  history: { daysAgo: number; price: number }[];
}

interface DemoCase {
  id: string;
  items: [DemoItem, DemoItem];
}

type DemoItemOrder = [number, number];
type DemoItemOrders = Record<string, DemoItemOrder>;

const DEMO_CASES: DemoCase[] = [
  {
    id: "dairy-and-coffee",
    items: [
      {
        id: "butter",
        name: "Butter",
        size: "500g",
        store: "New World",
        price: 8.99,
        verdict: "real",
        illustration: "butter",
        history: [
          { daysAgo: 90, price: 10.49 },
          { daysAgo: 68, price: 9.99 },
          { daysAgo: 49, price: 10.99 },
          { daysAgo: 31, price: 9.49 },
          { daysAgo: 14, price: 9.99 },
          { daysAgo: 0, price: 8.99 },
        ],
      },
      {
        id: "coffee",
        name: "Ground coffee",
        size: "200g",
        store: "Woolworths",
        price: 14.99,
        verdict: "dodgy",
        illustration: "coffee",
        history: [
          { daysAgo: 90, price: 11.99 },
          { daysAgo: 68, price: 12.49 },
          { daysAgo: 49, price: 13.99 },
          { daysAgo: 31, price: 14.49 },
          { daysAgo: 14, price: 13.99 },
          { daysAgo: 0, price: 14.99 },
        ],
      },
    ],
  },
  {
    id: "eggs-and-cereal",
    items: [
      {
        id: "eggs",
        name: "Free-range eggs",
        size: "12 pack",
        store: "PAK'nSAVE",
        price: 8.99,
        verdict: "real",
        illustration: "eggs",
        history: [
          { daysAgo: 90, price: 10.99 },
          { daysAgo: 68, price: 10.49 },
          { daysAgo: 49, price: 9.99 },
          { daysAgo: 31, price: 10.49 },
          { daysAgo: 14, price: 9.49 },
          { daysAgo: 0, price: 8.99 },
        ],
      },
      {
        id: "cereal",
        name: "Breakfast cereal",
        size: "750g",
        store: "New World",
        price: 9.99,
        verdict: "dodgy",
        illustration: "cereal",
        history: [
          { daysAgo: 90, price: 7.49 },
          { daysAgo: 68, price: 8.99 },
          { daysAgo: 49, price: 7.99 },
          { daysAgo: 31, price: 9.49 },
          { daysAgo: 14, price: 8.49 },
          { daysAgo: 0, price: 9.99 },
        ],
      },
    ],
  },
  {
    id: "bread-and-biscuits",
    items: [
      {
        id: "bread",
        name: "Wholemeal bread",
        size: "700g",
        store: "Woolworths",
        price: 3.49,
        verdict: "real",
        illustration: "bread",
        history: [
          { daysAgo: 90, price: 4.49 },
          { daysAgo: 68, price: 4.29 },
          { daysAgo: 49, price: 3.99 },
          { daysAgo: 31, price: 4.49 },
          { daysAgo: 14, price: 3.79 },
          { daysAgo: 0, price: 3.49 },
        ],
      },
      {
        id: "biscuits",
        name: "Chocolate biscuits",
        size: "250g",
        store: "PAK'nSAVE",
        price: 5.49,
        verdict: "dodgy",
        illustration: "biscuits",
        history: [
          { daysAgo: 90, price: 3.99 },
          { daysAgo: 68, price: 4.49 },
          { daysAgo: 49, price: 4.29 },
          { daysAgo: 31, price: 4.99 },
          { daysAgo: 14, price: 4.49 },
          { daysAgo: 0, price: 5.49 },
        ],
      },
    ],
  },
];

function currency(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
}

function shuffleCaseOrder(excludeIndex?: number): number[] {
  const order = DEMO_CASES.map((_, index) => index).filter((index) => index !== excludeIndex);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[otherIndex]] = [order[otherIndex], order[index]];
  }
  if (excludeIndex !== undefined) order.push(excludeIndex);
  return order;
}

function shuffleDemoItemOrders(): DemoItemOrders {
  const orders: DemoItemOrders = {};
  for (const demoCase of DEMO_CASES) {
    orders[demoCase.id] = Math.random() < 0.5 ? [0, 1] : [1, 0];
  }
  return orders;
}

function ProductArtwork({ illustration }: { illustration: ProductIllustration }) {
  return (
    <svg className={`demo-product-art demo-product-art--${illustration}`} viewBox="0 0 160 112" aria-hidden="true">
      {illustration === "butter" && (
        <>
          <path d="M43 37 62 23h58v59H43z" fill="#f2c84b" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="m43 37 19-14v59L43 92z" fill="#e6b83d" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M69 43h40M69 52h32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <text x="89" y="72" textAnchor="middle">BUTTER</text>
        </>
      )}
      {illustration === "coffee" && (
        <>
          <path d="m53 25 54 0 10 15-5 52H48l-5-52z" fill="#c58a5c" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M53 25h54M49 43h63" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="80" cy="63" r="11" fill="#f5e7d6" stroke="currentColor" strokeWidth="2.5" />
          <path d="M76 65c2-5 7-6 9-2-2 5-6 7-9 2Z" fill="#714832" />
          <text x="80" y="84" textAnchor="middle">COFFEE</text>
        </>
      )}
      {illustration === "eggs" && (
        <>
          <path d="M35 52h90l-7 35H42z" fill="#d9b78b" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="m42 52 8-19h60l15 19z" fill="#ead6b5" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M48 52h65" stroke="currentColor" strokeWidth="2.5" />
          <ellipse cx="61" cy="45" rx="8" ry="11" fill="#fffaf1" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="81" cy="43" rx="8" ry="11" fill="#fffaf1" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="101" cy="45" rx="8" ry="11" fill="#fffaf1" stroke="currentColor" strokeWidth="2" />
          <text x="80" y="75" textAnchor="middle">12 EGGS</text>
        </>
      )}
      {illustration === "cereal" && (
        <>
          <path d="M49 17h62v82H49z" fill="#a9c18e" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M49 17h62v15H49z" fill="#709252" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="68" cy="54" r="5" fill="#f2c84b" />
          <circle cx="84" cy="47" r="5" fill="#e9aa61" />
          <circle cx="97" cy="58" r="5" fill="#f2c84b" />
          <circle cx="77" cy="67" r="5" fill="#e9aa61" />
          <text x="80" y="88" textAnchor="middle">CEREAL</text>
        </>
      )}
      {illustration === "bread" && (
        <>
          <path d="M40 52c0-20 17-33 40-33s40 13 40 33v38H40z" fill="#e8bd7d" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M53 49c2-13 12-20 27-20s25 7 27 20" fill="none" stroke="#c98f4c" strokeWidth="3" strokeLinecap="round" />
          <path d="M40 62h80" stroke="currentColor" strokeWidth="2.5" />
          <text x="80" y="81" textAnchor="middle">WHOLEGRAIN</text>
        </>
      )}
      {illustration === "biscuits" && (
        <>
          <path d="M36 37h88v50H36z" fill="#d77c5e" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M36 37h17v50H36zM107 37h17v50h-17z" fill="#f0c28c" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="72" cy="61" r="14" fill="#f5dfb4" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="67" cy="57" r="2" fill="#70432e" /><circle cx="77" cy="64" r="2" fill="#70432e" /><circle cx="72" cy="69" r="2" fill="#70432e" />
          <text x="81" y="81" textAnchor="middle">BISCUITS</text>
        </>
      )}
    </svg>
  );
}

function MiniPriceHistory({ item }: { item: DemoItem }) {
  const width = 360;
  const height = 174;
  const left = 48;
  const right = 352;
  const top = 14;
  const bottom = 122;
  const values = item.history.map((point) => point.price);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || 1;
  const padding = spread * 0.18;
  const yMin = Math.max(0, minimum - padding);
  const yMax = maximum + padding;
  const pointAt = (point: DemoItem["history"][number]) => ({
    x: left + ((90 - point.daysAgo) / 90) * (right - left),
    y: bottom - ((point.price - yMin) / (yMax - yMin)) * (bottom - top),
  });
  const path = item.history.map((point, index) => {
    const { x, y } = pointAt(point);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  const low = Math.min(...values);
  const difference = item.price - low;
  const evidence = item.verdict === "real"
    ? `At ${currency(item.price)}, this matches its lowest example price in 90 days.`
    : `It has been as low as ${currency(low)} — ${currency(difference)} less than today’s special.`;

  return (
    <div className="demo-history-card">
      <div className="demo-history-heading">
        <div>
          <h4>90-day price history</h4>
          <p>{item.name} · {item.store}</p>
        </div>
        <span className={`demo-history-price demo-history-price--${item.verdict}`}>{currency(item.price)}</span>
      </div>
      <div className="demo-history-chart-wrap">
        <svg
          className={`demo-history-chart demo-history-chart--${item.verdict}`}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Illustrative 90-day price history for ${item.name} at ${item.store}. ${evidence}`}
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = top + (bottom - top) * fraction;
            return <line key={fraction} x1={left} x2={right} y1={y} y2={y} className="demo-history-gridline" />;
          })}
          <path d={path} className="demo-history-line" />
          {item.history.map((point) => {
            const { x, y } = pointAt(point);
            return <circle key={`${point.daysAgo}-${point.price}`} cx={x} cy={y} r="4.5" className="demo-history-point" />;
          })}
        </svg>
        <div className="demo-history-date-labels" aria-hidden="true"><span>90 days ago</span><span>Today</span></div>
      </div>
      <p className={`demo-history-evidence demo-history-evidence--${item.verdict}`}>{evidence}</p>
    </div>
  );
}

function TapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 11V5.75a1.5 1.5 0 0 1 3 0V11 8.75a1.5 1.5 0 0 1 3 0V11 9.75a1.5 1.5 0 0 1 3 0v5.1c0 3.4-2.3 5.65-5.7 5.65h-1.15c-1.45 0-2.8-.62-3.78-1.7L4.5 14.1a1.55 1.55 0 0 1 2.25-2.13L8.5 13.8V11Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RealDealGame() {
  const [caseOrder, setCaseOrder] = useState(() => DEMO_CASES.map((_, index) => index));
  const [itemOrders, setItemOrders] = useState<DemoItemOrders>(() => Object.fromEntries(DEMO_CASES.map(({ id }) => [id, [0, 1]])) as DemoItemOrders);
  const [casePosition, setCasePosition] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [caseKey, setCaseKey] = useState(0);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const currentCaseIndex = caseOrder[casePosition] ?? 0;
  const currentCase = DEMO_CASES[currentCaseIndex];
  const currentItems = currentCase.items.map((_, index) => currentCase.items[itemOrders[currentCase.id]?.[index] ?? index]);
  const selectedItem = currentCase.items.find((item) => item.id === selectedItemId) ?? null;
  const answered = selectedItem !== null;

  useEffect(() => {
    const shuffleFrame = window.requestAnimationFrame(() => {
      setCaseOrder(shuffleCaseOrder());
      setItemOrders(shuffleDemoItemOrders());
    });
    return () => window.cancelAnimationFrame(shuffleFrame);
  }, []);

  useEffect(() => {
    if (caseKey > 0) questionRef.current?.focus();
  }, [caseKey]);

  const tryAnotherCase = () => {
    setSelectedItemId(null);
    if (casePosition < caseOrder.length - 1) {
      setCasePosition((position) => position + 1);
    } else {
      setCaseOrder(shuffleCaseOrder(currentCaseIndex));
      setItemOrders(shuffleDemoItemOrders());
      setCasePosition(0);
    }
    setCaseKey((key) => key + 1);
  };

  const resetCase = () => {
    setSelectedItemId(null);
    setCaseKey((key) => key + 1);
  };

  return (
    <section className="real-deal-section" id="try-a-case" aria-labelledby="real-deal-title">
      <div className="real-deal-inner">
        <header className="real-deal-intro">
          <p className="real-deal-eyebrow">Try a case</p>
          <h2 id="real-deal-title">Which special is the real deal?</h2>
          <p>Pick the item you think is genuinely cheaper than usual. Then see what its price history says.</p>
        </header>

        <div className="real-deal-game-card">
          <div className="real-deal-card-topline">
            <span className="real-deal-case-number">CASE {String(casePosition + 1).padStart(2, "0")} <span>OF {String(DEMO_CASES.length).padStart(2, "0")}</span></span>
            <span className="real-deal-sample-note">Example prices · no sign-in · not live</span>
          </div>
          <div key={caseKey} className="real-deal-case-content">
            <h3 ref={questionRef} tabIndex={-1} className="real-deal-question">Which item looks like the better saving?</h3>
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
                    aria-disabled={answered}
                    aria-pressed={isSelected}
                    aria-label={`${String.fromCharCode(65 + index)}: ${item.name}, ${item.size}, special price ${currency(item.price)} at ${item.store}${answered ? `, ${isReal ? "Real Saver" : "Dodgy Deal"}` : ". Choose this deal"}`}
                  >
                    <span className="real-deal-art-panel">
                      <span className="real-deal-choice-letter">{String.fromCharCode(65 + index)}</span>
                      <ProductArtwork illustration={item.illustration} />
                      <span className="real-deal-special-tag">SPECIAL</span>
                    </span>
                    <span className="real-deal-choice-body">
                      <span className="real-deal-product-name">{item.name}</span>
                      <span className="real-deal-product-size">{item.size}</span>
                      <span className="real-deal-price-row">
                        <span className="real-deal-price">{currency(item.price)}</span>
                        <span className="real-deal-store">{item.store}</span>
                      </span>
                      {answered && (
                        <span className={`real-deal-verdict real-deal-verdict--${item.verdict}`}>
                          {isReal ? "Real Saver" : "Dodgy Deal"}
                        </span>
                      )}
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
                    <p>{selectedItem.verdict === "real" ? "You picked the Real Saver." : "This one is a Dodgy Deal. Its past prices tell a different story."}</p>
                  </div>
                </div>
                <MiniPriceHistory item={selectedItem} />
                <div className="real-deal-actions">
                  <button type="button" className="real-deal-button real-deal-button--secondary" onClick={resetCase}>Play this case again</button>
                  <button type="button" className="real-deal-button real-deal-button--primary" onClick={tryAnotherCase}>Try another case</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {answered && <p className="real-deal-download-prompt">Want to check your own specials? <a href="#top">Explore the Dodgy Deal app</a></p>}
      </div>
    </section>
  );
}
