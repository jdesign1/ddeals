"use client";

import { useState } from "react";

const INITIAL_FORM = {
  name: "",
  email: "",
  product: "",
  retailer: "",
  store: "",
  displayedPrice: "",
  message: "",
  website: "",
};
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SupportForm({ mode }: { mode: "support" | "report" }) {
  const isReport = mode === "report";
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canSubmit =
    EMAIL_FORMAT_RE.test(form.email.trim()) &&
    Boolean(form.message.trim()) &&
    (!isReport || Boolean(form.product.trim()));

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (submitState !== "idle") setSubmitState("idle");
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "sending") return;

    setSubmitState("sending");
    setSubmitError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...form, mode }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error || "We couldn't send that right now. Please try again.");
      }

      setForm({ ...INITIAL_FORM });
      setSubmitState("success");
    } catch (error) {
      setSubmitState("error");
      setSubmitError(error instanceof Error ? error.message : "We couldn't send that right now. Please try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl bg-white p-5 pb-28 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-name"} className="text-[13px] font-semibold leading-5 text-stone-700">
          Your name <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
        </label>
        <input
          id={mode + "-name"}
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-normal text-stone-700 shadow-sm focus:border-stone-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-email"} className="text-[13px] font-semibold leading-5 text-stone-700">
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
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-normal text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
        />
      </div>

      {isReport && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-product" className="text-[13px] font-semibold leading-5 text-stone-700">
              Product
            </label>
            <input
              id="report-product"
              type="text"
              required
              value={form.product}
              onChange={(event) => updateField("product", event.target.value)}
              placeholder="e.g. Coffee beans 1kg"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-normal text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-retailer" className="text-[13px] font-semibold leading-5 text-stone-700">
                Retailer <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="report-retailer"
                type="text"
                value={form.retailer}
                onChange={(event) => updateField("retailer", event.target.value)}
                placeholder="e.g. Woolworths"
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base font-normal text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-store" className="text-[13px] font-semibold leading-5 text-stone-700">
                Store or area <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="report-store"
                type="text"
                value={form.store}
                onChange={(event) => updateField("store", event.target.value)}
                placeholder="e.g. Auckland"
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base font-normal text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-price" className="text-[13px] font-semibold leading-5 text-stone-700">
              Price shown <span className="font-semibold tracking-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="report-price"
              type="text"
              inputMode="decimal"
              value={form.displayedPrice}
              onChange={(event) => updateField("displayedPrice", event.target.value)}
              placeholder="e.g. $8.99"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-normal text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mode + "-message"} className="text-[13px] font-semibold leading-5 text-stone-700">
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
          className="resize-y rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-base font-normal leading-6 text-stone-700 shadow-sm placeholder:text-stone-500 focus:border-stone-900 focus:outline-none"
        />
      </div>

      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={mode + "-website"}>Website</label>
        <input
          id={mode + "-website"}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => updateField("website", event.target.value)}
        />
      </div>

      <p className="text-[13px] leading-5 text-stone-500">
        We&rsquo;ll send this securely to our support team and reply to the email address you provide.
      </p>

      <div className="contact-submit-bar dd-sheet-cta-footer fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t border-stone-200 px-5 pt-3">
        <button
          type="submit"
          disabled={!canSubmit || submitState === "sending"}
          className="dd-btn dd-btn-primary w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitState === "sending" ? "Sending…" : isReport ? "Send report" : "Send message"}
        </button>
      </div>

      {submitState === "success" && (
        <p role="status" className="rounded-xl border border-fair-100 bg-fair-50 p-3 text-[13px] font-semibold leading-relaxed text-fair-950">
          Thanks — your {isReport ? "report" : "message"} has been sent. We&rsquo;ll get back to you by email.
        </p>
      )}

      {submitState === "error" && (
        <p role="alert" className="rounded-xl border border-alert-100 bg-alert-50 p-3 text-[13px] font-semibold leading-relaxed text-alert-950">
          {submitError}
        </p>
      )}
    </form>
  );
}
