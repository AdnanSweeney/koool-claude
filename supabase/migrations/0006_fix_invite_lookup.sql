-- ============================================================
-- Fix: invite link lookup fails for unauthenticated users
--
-- The join flow shows pool name/sport BEFORE the user signs in,
-- so the pools SELECT must work for the anon role too.
--
-- Also clean up the duplicate pools SELECT policies left by
-- migrations 0003 and 0005.
-- ============================================================

-- Drop all existing pools SELECT policies so we start clean
DROP POLICY IF EXISTS "Pools are viewable by invite code"    ON public.pools;
DROP POLICY IF EXISTS "Pools are viewable by pool members"   ON public.pools;
DROP POLICY IF EXISTS "Pools are viewable by authenticated users" ON public.pools;

-- 1. Anyone (including unauthenticated / incognito) can look up a pool.
--    Pools contain no sensitive data — they're shared via invite codes anyway.
CREATE POLICY "Pools are publicly viewable"
  ON public.pools FOR SELECT
  USING (true);

-- 2. Authenticated members can see pool details (kept separate for clarity,
--    but the policy above already covers this).
--    Nothing extra needed — USING (true) covers all roles.
