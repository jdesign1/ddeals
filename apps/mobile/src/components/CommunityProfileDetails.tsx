"use client";

import { MapPin, Quote, Store } from "lucide-react";

export default function CommunityProfileDetails({
  city,
  favoriteStoreBranch,
  quote,
  isDark,
}: {
  city: string | null | undefined;
  favoriteStoreBranch: string | null | undefined;
  quote: string | null | undefined;
  isDark: boolean;
}) {
  const details = [
    city ? { label: "City", value: city, Icon: MapPin } : null,
    favoriteStoreBranch ? { label: "Fave supermarket branch", value: favoriteStoreBranch, Icon: Store } : null,
  ].filter((detail): detail is { label: string; value: string; Icon: typeof MapPin } => Boolean(detail));

  if (details.length === 0 && !quote) return null;

  return (
    <div className={isDark ? "mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-white" : "mt-5 rounded-2xl bg-stone-50 p-4 text-stone-900"}>
      <p className={isDark ? "dd-type-secondary dd-type-secondary-strong text-white" : "dd-type-secondary dd-type-secondary-strong text-stone-900"}>Deal detective info</p>
      {details.length > 0 && (
        <dl className="mt-3 space-y-3">
          {details.map(({ label, value, Icon }) => (
            <div key={label} className="flex items-start gap-2.5">
              <Icon className={isDark ? "mt-0.5 h-4 w-4 flex-shrink-0 text-fair-300" : "mt-0.5 h-4 w-4 flex-shrink-0 text-fair-700"} aria-hidden="true" />
              <div className="min-w-0">
                <dt className={isDark ? "dd-type-meta text-white/55" : "dd-type-meta text-stone-500"}>{label}</dt>
                <dd className={isDark ? "mt-0.5 dd-type-secondary text-white" : "mt-0.5 dd-type-secondary text-stone-700"}>{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {quote && (
        <div className={details.length > 0 ? "mt-4 border-t border-white/10 pt-4" : "mt-3"}>
          <div className="flex items-start gap-2.5">
            <Quote className={isDark ? "mt-0.5 h-4 w-4 flex-shrink-0 text-fair-300" : "mt-0.5 h-4 w-4 flex-shrink-0 text-fair-700"} aria-hidden="true" />
            <div className="min-w-0">
              <dt className={isDark ? "dd-type-meta text-white/55" : "dd-type-meta text-stone-500"}>Quote</dt>
              <dd className={isDark ? "mt-1 dd-type-secondary italic leading-5 text-white" : "mt-1 dd-type-secondary italic leading-5 text-stone-700"}>“{quote}”</dd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
