-- Optional, account-backed category interests for personalised new-special belts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_categories text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS category_interests_prompted_at timestamptz;

CREATE OR REPLACE FUNCTION public.category_interests_are_unique(category_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.cardinality(category_values) = pg_catalog.cardinality(
    ARRAY(SELECT DISTINCT category FROM pg_catalog.unnest(category_values) AS category)
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_preferred_categories_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_categories_valid
      CHECK (
        cardinality(preferred_categories) <= 3
        AND COALESCE(array_ndims(preferred_categories), 1) = 1
        AND public.category_interests_are_unique(preferred_categories)
        AND preferred_categories <@ ARRAY[
          'Fruit & Veg', 'Meat & Poultry', 'Fish & Seafood', 'Fridge & Deli',
          'Dairy & Eggs', 'Bakery', 'Frozen', 'Pantry', 'Beer & Wine', 'Drinks',
          'Health & Body', 'Household & Cleaning', 'Baby & Child', 'Pets'
        ]::text[]
      );
  END IF;
END $$;

-- This feature is optional for established members; reserve the one-time
-- first-use prompt for accounts created after this migration.
UPDATE public.profiles
SET category_interests_prompted_at = now()
WHERE onboarding_complete IS TRUE
  AND category_interests_prompted_at IS NULL;

-- Keep the direct client update restricted to the signed-in shopper's own
-- profile even if an older environment's policy had drifted.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER POLICY profiles_update_own ON public.profiles
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

NOTIFY pgrst, 'reload schema';
