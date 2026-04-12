-- ============================================================
-- Migration: Inline tournament into pools
-- Pools now own their tournament config directly.
-- ============================================================

-- ---------- 1. Add tournament fields to pools ----------

ALTER TABLE public.pools
  ADD COLUMN sport            text NOT NULL DEFAULT '',
  ADD COLUMN status           text NOT NULL DEFAULT 'upcoming'
                              CHECK (status IN ('upcoming', 'locked', 'in_progress', 'completed')),
  ADD COLUMN teams            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN has_group_stage  boolean NOT NULL DEFAULT false,
  ADD COLUMN advance_per_group int,
  ADD COLUMN start_datetime   timestamptz NOT NULL DEFAULT now();

-- ---------- 2. Migrate existing pool data from tournaments ----------

UPDATE public.pools p
SET
  sport          = t.sport,
  status         = t.status,
  teams          = t.teams,
  start_datetime = t.start_datetime
FROM public.tournaments t
WHERE t.id = p.tournament_id;

-- ---------- 3. Create new tables ----------

CREATE TABLE public.groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  name            text NOT NULL,
  teams           jsonb NOT NULL DEFAULT '[]'::jsonb,
  advancing_teams jsonb,
  UNIQUE (pool_id, name)
);

CREATE TABLE public.knockout_matchups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  round           int NOT NULL,
  matchup_index   int NOT NULL,
  team_a          text,
  team_b          text,
  group_source_a  text,
  group_source_b  text,
  UNIQUE (pool_id, round, matchup_index)
);

CREATE TABLE public.group_picks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  group_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  advancing_teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at    timestamptz,
  UNIQUE (pool_id, user_id, group_id)
);

-- ---------- 4. Migrate results to reference pool_id ----------

-- Drop old results policies first (they reference tournament_id)
DROP POLICY IF EXISTS "Pool creators can insert results" ON public.results;
DROP POLICY IF EXISTS "Pool creators can update results" ON public.results;

ALTER TABLE public.results
  ADD COLUMN pool_id uuid REFERENCES public.pools(id) ON DELETE CASCADE;

-- Populate pool_id from existing tournament_id
UPDATE public.results r
SET pool_id = p.id
FROM public.pools p
WHERE p.tournament_id = r.tournament_id;

-- Now make pool_id NOT NULL and drop tournament_id
ALTER TABLE public.results
  ALTER COLUMN pool_id SET NOT NULL;

-- Drop the old unique constraint on (tournament_id, round, matchup_index)
ALTER TABLE public.results
  DROP CONSTRAINT IF EXISTS results_tournament_id_round_matchup_index_key;

ALTER TABLE public.results
  ADD CONSTRAINT results_pool_id_round_matchup_index_key
  UNIQUE (pool_id, round, matchup_index);

ALTER TABLE public.results
  DROP COLUMN tournament_id;

-- ---------- 5. Drop old RLS policies that reference tournaments ----------
-- Must happen BEFORE dropping tournament_id columns

-- picks
DROP POLICY IF EXISTS "Users can insert own picks when tournament is upcoming" ON public.picks;
DROP POLICY IF EXISTS "Users can update own picks when tournament is upcoming" ON public.picks;

-- bonus_questions
DROP POLICY IF EXISTS "Pool creators can insert bonus questions when upcoming" ON public.bonus_questions;
DROP POLICY IF EXISTS "Pool creators can update bonus questions when upcoming" ON public.bonus_questions;
DROP POLICY IF EXISTS "Pool creators can delete bonus questions when upcoming" ON public.bonus_questions;

-- bonus_answers
DROP POLICY IF EXISTS "Users can insert own bonus answers when upcoming" ON public.bonus_answers;
DROP POLICY IF EXISTS "Users can update own bonus answers when upcoming" ON public.bonus_answers;

-- ---------- 6. Drop tournament_id from pools and drop tournaments table ----------

ALTER TABLE public.pools
  DROP COLUMN tournament_id;

DROP TABLE public.tournaments;

-- ---------- 7. Recreate RLS policies without tournament references ----------

CREATE POLICY "Users can insert own picks when pool is upcoming"
  ON public.picks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = picks.pool_id AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Users can update own picks when pool is upcoming"
  ON public.picks FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = picks.pool_id AND p.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = picks.pool_id AND p.status = 'upcoming'
    )
  );

-- results: recreate insert/update policies (already dropped in section 4)
CREATE POLICY "Pool creators can insert results"
  ON public.results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = results.pool_id AND p.creator_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can update results"
  ON public.results FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = results.pool_id AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = results.pool_id AND p.creator_id = auth.uid()
    )
  );

-- bonus_questions: recreate policies (already dropped in section 5)
CREATE POLICY "Pool creators can insert bonus questions when upcoming"
  ON public.bonus_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Pool creators can update bonus questions when upcoming"
  ON public.bonus_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND p.status = 'upcoming'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Pool creators can delete bonus questions when upcoming"
  ON public.bonus_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND p.status = 'upcoming'
    )
  );

-- bonus_answers: recreate policies (already dropped in section 5)
CREATE POLICY "Users can insert own bonus answers when upcoming"
  ON public.bonus_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_answers.bonus_question_id AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Users can update own bonus answers when upcoming"
  ON public.bonus_answers FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_answers.bonus_question_id AND p.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_answers.bonus_question_id AND p.status = 'upcoming'
    )
  );

-- ---------- 7. RLS for new tables ----------

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Groups viewable by pool members"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = groups.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can manage groups"
  ON public.groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = groups.pool_id AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = groups.pool_id AND p.creator_id = auth.uid()
    )
  );

ALTER TABLE public.knockout_matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Knockout matchups viewable by pool members"
  ON public.knockout_matchups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = knockout_matchups.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can manage knockout matchups"
  ON public.knockout_matchups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = knockout_matchups.pool_id AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = knockout_matchups.pool_id AND p.creator_id = auth.uid()
    )
  );

ALTER TABLE public.group_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group picks viewable by pool members"
  ON public.group_picks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = group_picks.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own group picks when upcoming"
  ON public.group_picks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = group_picks.pool_id AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Users can update own group picks when upcoming"
  ON public.group_picks FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = group_picks.pool_id AND p.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = group_picks.pool_id AND p.status = 'upcoming'
    )
  );
