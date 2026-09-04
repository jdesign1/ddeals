"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Upload, X } from "lucide-react";

/**
 * Price-tag/barcode scanner bottom sheet — ported from
 * Prototype/index.html's `ScannerModal`. The prototype's own comment
 * explains why this doesn't do real barcode/OCR recognition: "Real
 * barcode/OCR recognition isn't feasible in a static prototype, so this no
 * longer fabricates a scan result." Instead it captures a photo via the
 * device's real camera (a file input with `capture="environment"` — the
 * standard way a web page triggers the native camera app, not a
 * canvas/getUserMedia live preview) or an uploaded photo, then hands the
 * user off to the real search flow to look the item up. That's still true
 * here — apps/mobile has no barcode/OCR pipeline either — so this is a
 * faithful, not simplified, port: same capture-then-search behaviour, same
 * markup/classes. `onSearchForItem` closes the scanner and opens the real
 * full-screen search overlay directly (components/FullScreenSearch.tsx,
 * added 2026-08-09) — mounted once globally in layout.tsx now
 * (components/GlobalOverlays.tsx), alongside this modal, both driven by
 * `lib/search-context.tsx` — matches the prototype's own
 * scanner-to-full-screen-search hand-off, no longer a simplified
 * inline-only substitute, and no longer needs a DOM `.focus()` hack to get
 * there since it's not tied to Home's own local state anymore.
 */
export default function ScannerModal({
  isOpen,
  onClose,
  onSearchForItem,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSearchForItem: () => void;
}) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setCapturedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    // Reset so choosing the same file again still fires onChange.
    event.target.value = "";
  }

  function handleRetake() {
    setCapturedImage(null);
  }

  function handleClose() {
    setCapturedImage(null);
    onClose();
  }

  function handleSearchForItem() {
    setCapturedImage(null);
    onClose();
    onSearchForItem();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="dd-bottom-sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          />

          <motion.div
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="dd-bottom-sheet dd-bottom-sheet-surface fixed bottom-0 left-0 right-0 z-[51] mx-auto flex min-h-[45vh] max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-x border-t border-stone-200 shadow-2xl"
          >
            <div className="dd-bottom-sheet-titlebar flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <Camera className="h-4 w-4 text-ink-600" aria-hidden="true" />
                {/* Bottom-sheet title style unified app-wide 2026-08-19 --
                    was text-base/font-bold/tracking-wider, now the same
                    text-lg/font-black/tracking-tight every bottom sheet's
                    title uses (see app/page.tsx's Sort sheet for the full
                    cross-reference). */}
                <h3 className="dd-type-sheet-title text-stone-900">
                  Price tag scanner
                </h3>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="rounded-full p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {!capturedImage && (
                <div className="space-y-4">
                  <p className="dd-type-secondary text-stone-500">
                    Point your camera at a shelf price tag or barcode to check it in-store, or upload a photo
                    you&rsquo;ve already taken.
                  </p>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    onChange={handleImageSelected}
                    className="hidden"
                  />
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50/30 py-8 transition-all hover:bg-ink-50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-600 shadow-md">
                      <Camera className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    <p className="dd-type-control text-stone-800">Scan barcode</p>
                    <p className="dd-type-meta text-stone-500">
                      Opens your camera
                    </p>
                  </button>

                  <div className="my-4 flex items-center">
                    <div className="grow border-t border-stone-200" />
                    <span className="mx-3 dd-type-meta text-stone-500">Or</span>
                    <div className="grow border-t border-stone-200" />
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    ref={galleryInputRef}
                    onChange={handleImageSelected}
                    className="hidden"
                  />
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 py-6 transition-all hover:border-stone-400 hover:bg-stone-50"
                  >
                    <Upload className="h-8 w-8 text-stone-400" aria-hidden="true" />
                    <p className="dd-type-control text-stone-800">Upload photo</p>
                    <p className="dd-type-meta text-stone-500">
                      Supports JPG, PNG, WEBP
                    </p>
                  </button>
                </div>
              )}

              {capturedImage && (
                <div className="space-y-6">
                  <div className="aspect-square w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                    {/* Plain <img>, not next/image: this is an in-memory data: URL
                        from FileReader, not a remote/static asset next/image can
                        optimize. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={capturedImage} alt="Captured price tag" className="h-full w-full object-cover" />
                  </div>
                  <p className="dd-type-secondary text-center text-stone-500">
                    Now search for this item to see its real price history and whether the current price is a
                    genuine deal.
                  </p>
                </div>
              )}
            </div>

            <div className="dd-sheet-cta-footer flex gap-3 border-t border-stone-200 bg-stone-50 px-4 pt-4">
              {/* Brand Guide v1.0 "06 — UI KIT / BUTTONS" pill styling
                  (2026-08-13 UI tidy-up): outline for the secondary action,
                  primary ink fill for the confirming one. */}
              {capturedImage ? (
                <>
                  <button
                    onClick={handleRetake}
                    className="dd-btn dd-btn-outline flex-1 cursor-pointer"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleSearchForItem}
                    className="dd-btn dd-btn-primary flex-1 cursor-pointer"
                  >
                    Search for This Item
                  </button>
                </>
              ) : (
                <button
                  onClick={handleClose}
                  className="dd-btn dd-btn-outline flex-1 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
