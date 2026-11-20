import type { CSSProperties } from "react";

const CONFETTI_PIECES = [
  { left: 3, x: -48, y: "19rem", rotation: -42, color: "#22c55e", delay: 0 },
  { left: 9, x: -22, y: "25rem", rotation: 28, color: "#f59e0b", delay: 90 },
  { left: 15, x: 34, y: "21rem", rotation: -24, color: "#6366f1", delay: 170 },
  { left: 21, x: -56, y: "28rem", rotation: 46, color: "#ef4444", delay: 45 },
  { left: 28, x: 26, y: "23rem", rotation: -55, color: "#14b8a6", delay: 220 },
  { left: 35, x: -36, y: "30rem", rotation: 36, color: "#eab308", delay: 120 },
  { left: 42, x: 52, y: "20rem", rotation: -32, color: "#ec4899", delay: 190 },
  { left: 49, x: -18, y: "27rem", rotation: 54, color: "#22c55e", delay: 25 },
  { left: 56, x: 44, y: "24rem", rotation: -48, color: "#f97316", delay: 145 },
  { left: 63, x: -58, y: "31rem", rotation: 25, color: "#6366f1", delay: 260 },
  { left: 70, x: 30, y: "22rem", rotation: -36, color: "#ef4444", delay: 70 },
  { left: 77, x: -26, y: "29rem", rotation: 42, color: "#14b8a6", delay: 235 },
  { left: 84, x: 56, y: "20rem", rotation: -28, color: "#f59e0b", delay: 160 },
  { left: 91, x: -44, y: "26rem", rotation: 50, color: "#22c55e", delay: 105 },
  { left: 97, x: 24, y: "30rem", rotation: -44, color: "#ec4899", delay: 285 },
] as const;

export default function DealDetectiveConfetti() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={index}
          className="deal-detective-confetti absolute top-0 h-4 w-2 rounded-sm"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}ms`,
            "--confetti-x": `${piece.x}px`,
            "--confetti-y": piece.y,
            "--confetti-rotation": `${piece.rotation}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
