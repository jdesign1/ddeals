"use client";

import { useEffect, useRef } from "react";
import WinkMascot from "../../../mobile/src/components/WinkMascot";

type MarketingMascotProps = {
  className: string;
};

export default function MarketingMascot({ className }: MarketingMascotProps) {
  const mascotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restartAnimations = () => {
      if (document.visibilityState !== "visible") return;

      const mascot = mascotRef.current;
      if (!mascot) return;

      const elements = [mascot, ...Array.from(mascot.querySelectorAll("*"))];
      for (const element of elements) {
        for (const animation of element.getAnimations()) {
          animation.currentTime = 0;
          animation.play();
        }
      }
    };

    restartAnimations();
    document.addEventListener("visibilitychange", restartAnimations);
    window.addEventListener("pageshow", restartAnimations);
    return () => {
      document.removeEventListener("visibilitychange", restartAnimations);
      window.removeEventListener("pageshow", restartAnimations);
    };
  }, []);

  return (
    <div ref={mascotRef} className={className} aria-hidden="true">
      <WinkMascot className="wink-mascot--search marketing-mascot" />
    </div>
  );
}
