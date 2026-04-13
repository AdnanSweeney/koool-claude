-- Add configurable scoring to pools.
-- Default matches the previously hardcoded behaviour so existing pools are unaffected.
ALTER TABLE public.pools
  ADD COLUMN scoring jsonb NOT NULL DEFAULT '{"group":1,"knockout":[1,2,4,8]}'::jsonb;
