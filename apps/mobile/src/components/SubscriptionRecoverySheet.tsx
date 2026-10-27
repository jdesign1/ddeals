"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import BottomSheetPortal from "@/components/BottomSheetPortal";

type SubscriptionRecoveryKind = "linked-to-other-account" | "not-linked";

export default function SubscriptionRecoverySheet({
  open,
  kind,
  onClose,
}: {
  open: boolean;
  kind: SubscriptionRecoveryKind;
  onClose: () => void;
}) {
  const isLinkedToOtherAccount = kind === "linked-to-other-account";

  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close subscription help"
              onClick={onClose}
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[70] mx-auto w-full max-w-[480px] bg-stone-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="subscription-recovery-title"
              aria-describedby="subscription-recovery-description"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[71] mx-auto flex min-h-[34vh] w-full max-w-[480px] flex-col rounded-t-3xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <h2 id="subscription-recovery-title" className="dd-type-sheet-title text-stone-900">
                  {isLinkedToOtherAccount ? "This subscription belongs to another account" : "Subscription needs account recovery"}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="dd-bottom-sheet-close cursor-pointer text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-4 px-5 py-5 pb-safe-sm">
                <p id="subscription-recovery-description" className="dd-type-body text-stone-600">
                  {isLinkedToOtherAccount
                    ? "This Apple subscription is already linked to a different Dodgy Deal account. If you know which account originally started it, log out and sign in with that account. Otherwise, contact us and we will help recover access."
                    : "Apple has confirmed this subscription, but it is not linked to a Dodgy Deal account yet. Contact us and we will help recover access."}
                </p>

                <div className="mt-auto flex flex-col gap-3 pt-2">
                  <Link href="/support" onClick={onClose} className="dd-btn dd-btn-primary w-full cursor-pointer">
                    Contact support
                  </Link>
                  <button type="button" onClick={onClose} className="dd-btn dd-btn-outline-muted w-full cursor-pointer">
                    Not now
                  </button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}
