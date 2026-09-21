-- Prevent role-controlled search_path resolution in the identity-link promotion function.
--
-- The function signature is discovered from pg_proc so this remains safe if the
-- function has arguments or is overloaded. The migration fails rather than
-- silently succeeding if the expected function is not present.
DO $$
DECLARE
  function_signature text;
  function_found boolean := false;
BEGIN
  FOR function_signature IN
    SELECT format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'promote_identity_links'
  LOOP
    function_found := true;
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp',
      function_signature
    );
  END LOOP;

  IF NOT function_found THEN
    RAISE EXCEPTION 'Expected public.promote_identity_links function was not found';
  END IF;
END
$$;
