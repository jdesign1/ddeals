-- Optional, user-controlled details for the public community shopper profile.
-- These columns stay protected by the existing profiles RLS policies. The
-- community profile API deliberately emits only these three fields after it
-- has verified that a referenced tip is approved and published.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS favorite_store_branch text,
  ADD COLUMN IF NOT EXISTS profile_quote text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_public_city_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_public_city_length
      CHECK (city IS NULL OR (char_length(btrim(city)) BETWEEN 1 AND 60 AND city !~ '[[:cntrl:]]'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_public_store_branch_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_public_store_branch_length
      CHECK (favorite_store_branch IS NULL OR (char_length(btrim(favorite_store_branch)) BETWEEN 1 AND 80 AND favorite_store_branch !~ '[[:cntrl:]]'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_public_quote_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_public_quote_length
      CHECK (profile_quote IS NULL OR (char_length(btrim(profile_quote)) BETWEEN 1 AND 160 AND profile_quote !~ '[[:cntrl:]]'));
  END IF;
END $$;
