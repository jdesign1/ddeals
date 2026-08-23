"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

/**
 * Full-screen page-loading state (2026-08-10, per Jay's ask), first used by
 * `deal/[id]/[store]/page.tsx`. A solid white `fixed inset-0` cover with
 * just the mascot logo doing its turn-to-face-left/right loop
 * (`animate-mascot-turn`, the same animation `LoadingMascot` already uses
 * for e.g. the specials page's "Loading specials…" state) -- no label
 * text. Distinct from `LoadingMascot` (still used unchanged for that kind
 * of small inline loading state): this one is meant to cover the *entire*
 * viewport, header/bottom-nav included, during a route transition, not
 * sit inline within a page's own content column.
 *
 * `z-[70]` -- above `FullScreenSearch`'s overlay (`z-50`) and its category
 * and sort sheets (both `z-[60]`, the sort one added 2026-08-13 alongside
 * `page.tsx`'s own Trending/My List sort sheets, per Jay's ask to turn "the
 * sort drop down menu on all pages" into a bottom sheet), `ScannerModal`
 * (`z-[51]`), `AppHeader` (`z-[45]` --
 * bumped 2026-08-12 from `z-40` so its own profile-menu bottom sheet wins
 * over `BottomNav`, see that component's own doc comment), and `BottomNav`
 * itself (`z-40`), so it visually wins over whatever else is on screen mid
 * transition, regardless of what's still animating underneath it.
 *
 * Deliberately does NOT fade its own white background in on mount --
 * `initial`/`animate` are the same (`opacity: 1`), so `motion.div` renders
 * fully solid from its very first paint with no incoming transition to
 * play. A background fade-IN would mean a brief translucent window where
 * whatever's mid-transition behind it bleeds through -- concretely, this
 * is what fixed the 2026-08-10 "user briefly sees Home when tapping a
 * product card in full-screen search" bug: `FullScreenSearch`'s own
 * overlay plays a 200ms opacity exit fade when a card navigates away, and
 * without an instantly-solid cover on the destination page, that fade
 * would reveal whatever route was underneath the search overlay for that
 * whole window. Only the `exit` value differs (`opacity: 0`), so
 * `AnimatePresence` still plays a smooth fade-OUT once `loading` goes
 * false and defers the actual unmount until it completes -- animating the
 * way out is safe, since whatever's revealed underneath by then is the
 * real, fully-loaded destination content, not a flash of the wrong page.
 *
 * The logo itself fades in (shortly after mount, once the white
 * background is already solid -- so its own fade has nothing wrong to
 * expose) and fades out along with the rest of this component as it
 * unmounts, per Jay's specific ask ("fade in and fade out the logo").
 */
export default function PageLoader({ loading }: { loading: boolean }) {
  const [logoVisible, setLogoVisible] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLogoVisible(false);
      return;
    }
    // Double rAF: lets the browser paint the logo at opacity-0 first, then
    // flips it to opacity-100 on the next frame so the CSS transition
    // actually has a "before" state to animate from -- a same-frame class
    // change (setting both in one paint) wouldn't visibly transition.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLogoVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [loading]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-white"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={48}
            height={48}
            className={`h-12 w-12 animate-mascot-turn transition-opacity duration-300 ease-out ${
              logoVisible ? "opacity-100" : "opacity-0"
            }`}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
