import type { SupabaseRestConfig } from "./data.ts";

/** Public catalogue project configuration shared by the app and marketing demo. */
export const DEFAULT_DDEALS_SUPABASE_URL = "https://dlcaxnorkqorrkfxigfg.supabase.co";
export const DEFAULT_DDEALS_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsY2F4bm9ya3FvcnJrZnhpZ2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjU2MzMsImV4cCI6MjA5NTAwMTYzM30.5H3OGOtDD6fq8OpVlBe71HhOAd_mjEh8XnAMa2ykBnc";

export function createDdealsCatalogueConfig(env: {
  url?: string;
  anonKey?: string;
  catalogueUrl?: string;
  catalogueVersionUrl?: string;
  allowDirectCatalogueFallback?: boolean;
} = {}): SupabaseRestConfig {
  return {
    url: env.url || DEFAULT_DDEALS_SUPABASE_URL,
    anonKey: env.anonKey || DEFAULT_DDEALS_SUPABASE_ANON_KEY,
    ...(env.catalogueUrl ? { catalogueUrl: env.catalogueUrl } : {}),
    ...(env.catalogueVersionUrl ? { catalogueVersionUrl: env.catalogueVersionUrl } : {}),
    ...(env.allowDirectCatalogueFallback ? { allowDirectCatalogueFallback: true } : {}),
  };
}
