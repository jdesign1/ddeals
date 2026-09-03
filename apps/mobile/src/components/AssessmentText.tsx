import type { ReactNode } from "react";

const PRICE_IN_PARENS = /\(\s*(\$[\d,]+(?:\.\d{1,2})?)\s*\)/g;
const EMPHASIZED_TOKEN = /^(?:\$[\d,]+(?:\.\d{1,2})?|-?\d+(?:\.\d+)?%)$/;
const EMPHASIZED_TOKENS = /(\$[\d,]+(?:\.\d{1,2})?|-?\d+(?:\.\d+)?%)/g;

/** Formats assessment copy consistently without changing the underlying data. */
export default function AssessmentText({ text }: { text: string }): ReactNode {
  const normalized = text
    .replace(PRICE_IN_PARENS, "$1")
    .replace(/\binflated\b/gi, "dodgy");

  return (
    <>
      {normalized.split(EMPHASIZED_TOKENS).map((part, index) =>
        EMPHASIZED_TOKEN.test(part) ? (
          <strong key={`${part}-${index}`} className="font-extrabold">
            {part}
          </strong>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}
