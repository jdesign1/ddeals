import type { SupabaseRestConfig } from "@dodgey-deals/shared";

/**
 * Same Supabase project/anon key `Prototype/index.html` talks to directly
 * (see project.md). Falls back to the same values the prototype hardcodes
 * if env vars aren't set, so `next dev` works out of the box without an
 * `.env.local` — see `.env.example` for the opt-in override.
 */
export const supabaseConfig: SupabaseRestConfig = {
  url:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://dlcaxnorkqorrkfxigfg.supabase.co",
  anonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsY2F4bm9ya3FvcnJrZnhpZ2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjU2MzMsImV4cCI6MjA5NTAwMTYzM30.5H3OGOtDD6fq8OpVlBe71HhOAd_mjEh8XnAMa2ykBnc",
};
