import Link from "next/link";

/**
 * "Home" tab has NO Stitch mockup — the 12-screen inventory in project.md
 * only covers Lists (S1, "home for Lists tab"), Specials (S8), and Me (S9).
 * This is a deliberately minimal interim landing, not a design port.
 * Flagged in project.md as an open gap.
 */
export default function HomePage() {
  return (
    <main className="flex flex-col gap-6 px-5 py-8">
      <h1 className="text-2xl font-extrabold text-stone-900">Dodgy Deal</h1>
      <p className="text-sm text-stone-600">
        Home screen has no design spec yet — see &ldquo;Design vs Prototype Gaps&rdquo; in
        project.md. Head to Specials to see live deals.
      </p>
      <Link
        href="/specials"
        className="inline-flex w-fit items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--color-brand-primary)" }}
      >
        Browse Specials
      </Link>
    </main>
  );
}
