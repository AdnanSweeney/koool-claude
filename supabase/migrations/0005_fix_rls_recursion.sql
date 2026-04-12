-- ============================================================
-- Fix: infinite recursion in pool_members RLS policy
--
-- The original policy checked pool_members from within a
-- pool_members policy, causing Postgres to recurse infinitely.
--
-- Fix: create a SECURITY DEFINER function that queries
-- pool_members with RLS bypassed, then use it in all policies
-- that need to verify pool membership.
-- ============================================================

-- ── Helper: check pool membership without triggering RLS ────────────────────

CREATE OR REPLACE FUNCTION public.is_pool_member(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pool_members
    WHERE pool_id = p_pool_id AND user_id = auth.uid()
  );
$$;

-- ── pool_members: replace recursive policy ──────────────────────────────────

DROP POLICY IF EXISTS "Pool members are viewable by members of that pool"
  ON public.pool_members;

CREATE POLICY "Pool members are viewable by members of that pool"
  ON public.pool_members FOR SELECT
  TO authenticated
  USING (public.is_pool_member(pool_members.pool_id));

-- ── pools: replace subquery with helper ─────────────────────────────────────

DROP POLICY IF EXISTS "Pools are viewable by pool members" ON public.pools;

CREATE POLICY "Pools are viewable by pool members"
  ON public.pools FOR SELECT
  TO authenticated
  USING (public.is_pool_member(id));

-- ── picks ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Picks are viewable by pool members" ON public.picks;

CREATE POLICY "Picks are viewable by pool members"
  ON public.picks FOR SELECT
  TO authenticated
  USING (public.is_pool_member(picks.pool_id));

-- ── groups ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Groups viewable by pool members" ON public.groups;

CREATE POLICY "Groups viewable by pool members"
  ON public.groups FOR SELECT
  TO authenticated
  USING (public.is_pool_member(groups.pool_id));

-- ── knockout_matchups ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Knockout matchups viewable by pool members" ON public.knockout_matchups;

CREATE POLICY "Knockout matchups viewable by pool members"
  ON public.knockout_matchups FOR SELECT
  TO authenticated
  USING (public.is_pool_member(knockout_matchups.pool_id));

-- ── group_picks ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Group picks viewable by pool members" ON public.group_picks;

CREATE POLICY "Group picks viewable by pool members"
  ON public.group_picks FOR SELECT
  TO authenticated
  USING (public.is_pool_member(group_picks.pool_id));

-- ── bonus_questions ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Bonus questions viewable by pool members" ON public.bonus_questions;

CREATE POLICY "Bonus questions viewable by pool members"
  ON public.bonus_questions FOR SELECT
  TO authenticated
  USING (public.is_pool_member(bonus_questions.pool_id));

-- ── bonus_answers ────────────────────────────────────────────────────────────
-- bonus_answers joins through bonus_questions to get pool_id

DROP POLICY IF EXISTS "Bonus answers viewable by pool members" ON public.bonus_answers;

CREATE POLICY "Bonus answers viewable by pool members"
  ON public.bonus_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      WHERE bq.id = bonus_answers.bonus_question_id
        AND public.is_pool_member(bq.pool_id)
    )
  );

-- ── bonus_scores ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Bonus scores viewable by pool members" ON public.bonus_scores;

CREATE POLICY "Bonus scores viewable by pool members"
  ON public.bonus_scores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      WHERE bq.id = bonus_scores.bonus_question_id
        AND public.is_pool_member(bq.pool_id)
    )
  );
