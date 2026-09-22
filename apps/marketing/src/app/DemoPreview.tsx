"use client";

import { useState } from "react";

const samples = {
  butter: {
    label: "Butter",
    brand: "Anchor",
    name: "Butter salted",
    size: "500g",
    glyph: "B",
    verdict: "Real Saver",
    verdictTone: "real-saver",
    insightTitle: "Looks like a real saving",
    insightBody: "Below the recent usual price.",
    prices: [
      ["Pak’nSave", "$6.49", "best"],
      ["New World", "$6.99", "higher"],
      ["Woolworths", "$7.49", "higher"],
    ],
  },
  coffee: {
    label: "Coffee",
    brand: "Robert Harris",
    name: "Classic roast",
    size: "200g",
    glyph: "C",
    verdict: "Fair Deal",
    verdictTone: "fair-price",
    insightTitle: "A modest saving",
    insightBody: "A familiar promotion, not a historic low.",
    prices: [
      ["Pak’nSave", "$8.99", "best"],
      ["New World", "$9.49", "higher"],
      ["Woolworths", "$9.49", "higher"],
    ],
  },
  weetbix: {
    label: "Weet-Bix",
    brand: "Sanitarium",
    name: "Weet-Bix original",
    size: "1kg",
    glyph: "W",
    verdict: "Dodgy Deal",
    verdictTone: "dodgy",
    insightTitle: "Worth a second look",
    insightBody: "The ticket is not below its recent usual price.",
    prices: [
      ["Pak’nSave", "$7.29", "best"],
      ["New World", "$7.49", "higher"],
      ["Woolworths", "$7.99", "higher"],
    ],
  },
} as const;

type SampleKey = keyof typeof samples;

export default function DemoPreview() {
  const [active, setActive] = useState<SampleKey>("butter");
  const sample = samples[active];

  return (
    <section className="product-preview" aria-label="Illustrative Dodgy Deal product check">
      <div className="preview-topline">
        <span>Try a sample check</span>
        <span className="preview-status"><i /> Illustrative</span>
      </div>
      <div className="preview-search" aria-label="Sample product search">
        <span className="preview-search-icon" aria-hidden="true">⌕</span>
        <span>Search for a product or brand</span>
        <strong>{sample.label}</strong>
      </div>
      <div className="preview-tabs" role="tablist" aria-label="Sample products">
        {(Object.keys(samples) as SampleKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={active === key ? "is-active" : ""}
            onClick={() => setActive(key)}
          >
            {samples[key].label}
          </button>
        ))}
      </div>
      <div className="preview-product">
        <span className="preview-product-icon" aria-hidden="true">{sample.glyph}</span>
        <span className="preview-product-name"><b>{sample.brand}</b><strong>{sample.name}</strong><small>{sample.size} · compare stores</small></span>
        <span className={`preview-verdict preview-verdict-${sample.verdictTone}`}>{sample.verdict}</span>
      </div>
      <div className="preview-price-list">
        {sample.prices.map(([store, price, tone]) => (
          <div key={store}>
            <span>{store}</span><strong className={tone}>{price}</strong>{tone === "best" ? <em>Lowest</em> : <small>+ vs lowest</small>}
          </div>
        ))}
      </div>
      <div className={`preview-insight preview-insight-${sample.verdictTone}`}>
        <span aria-hidden="true">{sample.verdictTone === "dodgy" ? "!" : sample.verdictTone === "fair-price" ? "≈" : "✓"}</span>
        <span><b>{sample.insightTitle}</b><small>{sample.insightBody}</small></span>
      </div>
      <p className="preview-footnote">Illustrative example. Prices in the app can change.</p>
    </section>
  );
}
