-- Ensure PostgREST sees the atomic helpful-vote RPC immediately after deploy.
NOTIFY pgrst, 'reload schema';
