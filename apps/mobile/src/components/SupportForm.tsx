"use client";

import { useState } from "react";

const SUPPORT_EMAIL = "dodgydealnz@gmail.com";

export default function SupportForm({ mode }: { mode: "support" | "report" }) {
  const isReport = mode === "report";
  const [form, setForm] = useState({
    name: "",
    email: "",
    product: "",
    retailer: "",
    store: "",
    displayedPrice: "",
    message: "",
  });
  const [emailOpened, setEmailOpened] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = isReport
      ? "Incorrect deal report: " + (form.product || "Product")
      : "Dodgy Deal support request";
    const body = isReport
      ? [
          "Name: " + (form.name || "Not provided"),
          "Reply email: " + form.email,
          "Product: " + form.product,
          "Retailer: " + (form.retailer || "Not provided"),
          "Store or location: " + (form.store || "Not provided"),
          "Displayed price: " + (form.displayedPrice || "Not provided"),
          "",
          "What needs correcting:",
          form.message,
        ].join("\n")
      : [
          "Name: " + (form.name || "Not provided"),
          "Reply email: " + form.email,
          "",
          "How can we help?",
          form.message,
        ].join("\n");

    window.location.href =
      "mailto:" +
      SUPPORT_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    setEmailOpened(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-name"} className="font-display text-[11px] font-black tracking-widest text-stone-500">
          Your name <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
        </label>
        <input
          id={mode + "-name"}
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm focus:border-stone-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-email"} className="font-display text-[11px] font-black tracking-widest text-stone-500">
          Email address
        </label>
        <input
          id={mode + "-email"}
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="name@example.com"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
        />
      </div>

      {isReport && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-product" className="font-display text-[11px] font-black tracking-widest text-stone-500">
              Product
            </label>
            <input
              id="report-product"
              type="text"
              required
              value={form.product}
              onChange={(event) => updateField("product", event.target.value)}
              placeholder="e.g. Coffee beans 1kg"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-retailer" className="font-display text-[11px] font-black tracking-widest text-stone-500">
                Retailer <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="report-retailer"
                type="text"
                value={form.retailer}
                onChange={(event) => updateField("retailer", event.target.value)}
                placeholder="e.g. Woolworths"
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-store" className="font-display text-[11px] font-black tracking-widest text-stone-500">
                Store or area <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="report-store"
                type="text"
                value={form.store}
                onChange={(event) => updateField("store", event.target.value)}
                placeholder="e.g. Auckland"
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-price" className="font-display text-[11px] font-black tracking-widest text-stone-500">
              Price shown <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="report-price"
              type="text"
              inputMode="decimal"
              value={form.displayedPrice}
              onChange={(event) => updateField("displayedPrice", event.target.value)}
              placeholder="e.g. $8.99"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-message"} className="font-display text-[11px] font-black tracking-widest text-stone-500">
          {isReport ? "What needs correcting?" : "How can we help?"}
        </label>
        <textarea
          id={mode + "-message"}
          required
          rows={5}
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          placeholder={
            isReport
              ? "Tell us what looks wrong and what you expected to see."
              : "Tell us what happened or what you need help with."
          }
          className="resize-y rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium leading-relaxed text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
        />
      </div>

      <p className="text-[12px] leading-relaxed text-stone-500">
        Tapping the button opens your email app with the details filled in. You can review the message before sending
        it to {SUPPORT_EMAIL}.
      </p>

      <button type="submit" className="dd-btn dd-btn-primary w-full cursor-pointer">
        Open email
      </button>

      {emailOpened && (
        <p className="rounded-xl border border-fair-100 bg-fair-50 p-3 text-[13px] font-semibold leading-relaxed text-fair-950">
          If your email app did not open, email {SUPPORT_EMAIL} directly.
        </p>
      )}
    </form>
  );
}
