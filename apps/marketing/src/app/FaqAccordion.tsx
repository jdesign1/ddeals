"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    question: "What is Dodgy Deal?",
    answer: "Dodgy Deal helps you figure out whether a supermarket special is a genuine saving—or just a “special” price that isn’t quite the bargain it’s made out to be.",
  },
  {
    question: "How does Dodgy Deal decide if a deal is genuine?",
    answer: "It checks today’s price against the product’s recent price history, so you can see whether you’re getting a decent saving, a small discount, or a special that looks a bit dodgy.",
  },
  {
    question: "What do “Real Deal”, “Fair Deal”, and “Dodgy Deal” mean?",
    answer: "A Real Deal looks like a worthwhile saving. A Fair Deal is a genuine discount, but not a huge one. A Dodgy Deal means the special may not be the saving it first appears to be.",
  },
  {
    question: "Which supermarkets does Dodgy Deal cover?",
    answer: "Dodgy Deal compares products and prices from participating supermarkets across Aotearoa. What’s available can vary depending on the supermarket and the product.",
  },
  {
    question: "Can I compare prices between supermarkets?",
    answer: "Yep. Search for a product to compare current prices and find cheaper options at other supermarkets—handy when you’re trying to make the grocery budget stretch a bit further.",
  },
  {
    question: "How much price history does the app show?",
    answer: "The app uses up to 90 days of price history, giving you a better idea of how a product’s price has moved over time—not just what it costs today.",
  },
  {
    question: "What if there isn’t enough price history for a product?",
    answer: "Sometimes Dodgy Deal will say it’s still checking rather than make a call. That simply means we need a bit more history before we can give you a useful, reliable verdict.",
  },
  {
    question: "Can Dodgy Deal tell me whether to buy now or wait?",
    answer: "It gives you the price context and shopping tips to help decide whether today’s price is worth popping in the trolley—or whether it might pay to wait.",
  },
] as const;

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="faq-list">
      {FAQ_ITEMS.map(({ question, answer }, index) => {
        const isOpen = openIndex === index;
        const questionId = `faq-question-${index + 1}`;
        const answerId = `faq-answer-${index + 1}`;

        return (
          <div className={`faq-item${isOpen ? " faq-item--open" : ""}`} key={question}>
            <h3 className="faq-question">
              <button
                className="faq-trigger"
                id={questionId}
                type="button"
                aria-controls={answerId}
                aria-expanded={isOpen}
                onClick={() => setOpenIndex((currentIndex) => (currentIndex === index ? null : index))}
              >
                <span>{question}</span>
                <span className="faq-trigger-icon" aria-hidden="true">{isOpen ? "−" : "+"}</span>
              </button>
            </h3>
            <div
              className={`faq-answer${isOpen ? " faq-answer--open" : ""}`}
              id={answerId}
              role="region"
              aria-labelledby={questionId}
            >
              <div className="faq-answer__inner">
                <p>{answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
