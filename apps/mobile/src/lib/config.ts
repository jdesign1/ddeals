import { createDdealsCatalogueConfig } from "@dodgey-deals/shared";

/**
 * Same Supabase project/anon key `Prototype/index.html` talks to directly
 * (see project.md). Falls back to the same values the prototype hardcodes
 * if env vars aren't set, so `next dev` works out of the box without an
 * `.env.local` — see `.env.example` for the opt-in override.
 */
export const supabaseConfig = createDdealsCatalogueConfig({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  catalogueUrl: process.env.NEXT_PUBLIC_CATALOGUE_URL || "/api/catalogue/latest.json",
  catalogueVersionUrl: process.env.NEXT_PUBLIC_CATALOGUE_VERSION_URL || "/api/catalogue/version.json",
  allowDirectCatalogueFallback: process.env.NEXT_PUBLIC_ALLOW_CATALOGUE_SUPABASE_FALLBACK === "true",
});
