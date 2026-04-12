-- Allow any authenticated user to look up a pool by invite_code
-- (needed for the join flow before they are a member)
CREATE POLICY "Pools are viewable by invite code"
  ON public.pools FOR SELECT
  TO authenticated
  USING (true);

-- Drop the old restrictive policy since this one is broader
DROP POLICY "Pools are viewable by pool members" ON public.pools;
