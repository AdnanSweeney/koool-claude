-- ============================================================
-- Koool: Initial Schema
-- ============================================================

-- ---------- TABLES ----------

CREATE TABLE public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  email       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tournaments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  sport           text NOT NULL,
  start_datetime  timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming', 'locked', 'in_progress', 'completed')),
  teams           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  invite_code     text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pool_members (
  pool_id    uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE public.picks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round           int NOT NULL,
  matchup_index   int NOT NULL,
  picked_team     text NOT NULL,
  submitted_at    timestamptz,
  UNIQUE (pool_id, user_id, round, matchup_index)
);

CREATE TABLE public.results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round           int NOT NULL,
  matchup_index   int NOT NULL,
  winning_team    text NOT NULL,
  entered_by      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entered_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, matchup_index)
);

CREATE TABLE public.bonus_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  question_text   text NOT NULL,
  points          int NOT NULL DEFAULT 1,
  correct_answer  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bonus_answers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_question_id   uuid NOT NULL REFERENCES public.bonus_questions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  answer_text         text NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bonus_question_id, user_id)
);

CREATE TABLE public.bonus_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_question_id   uuid NOT NULL REFERENCES public.bonus_questions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points_awarded      int NOT NULL DEFAULT 0,
  manually_set        boolean NOT NULL DEFAULT false,
  set_by              uuid REFERENCES public.users(id),
  set_at              timestamptz,
  UNIQUE (bonus_question_id, user_id)
);

-- ---------- AUTO-CREATE USER PROFILE ON SIGNUP ----------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---------- users ----------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users are viewable by authenticated users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own row"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------- tournaments ----------
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tournaments are viewable by authenticated users"
  ON public.tournaments FOR SELECT
  TO authenticated
  USING (true);

-- ---------- pools ----------
ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pools are viewable by pool members"
  ON public.pools FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create pools"
  ON public.pools FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- ---------- pool_members ----------
ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool members are viewable by members of that pool"
  ON public.pool_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = pool_members.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can join pools"
  ON public.pool_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------- picks ----------
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Picks are viewable by pool members"
  ON public.picks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = picks.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own picks when tournament is upcoming"
  ON public.picks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = picks.pool_id AND t.status = 'upcoming'
    )
  );

CREATE POLICY "Users can update own picks when tournament is upcoming"
  ON public.picks FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = picks.pool_id AND t.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = picks.pool_id AND t.status = 'upcoming'
    )
  );

-- ---------- results ----------
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Results are viewable by authenticated users"
  ON public.results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pool creators can insert results"
  ON public.results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.tournament_id = results.tournament_id
        AND p.creator_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can update results"
  ON public.results FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.tournament_id = results.tournament_id
        AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.tournament_id = results.tournament_id
        AND p.creator_id = auth.uid()
    )
  );

-- ---------- bonus_questions ----------
ALTER TABLE public.bonus_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bonus questions viewable by pool members"
  ON public.bonus_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pool_members pm
      WHERE pm.pool_id = bonus_questions.pool_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can insert bonus questions when upcoming"
  ON public.bonus_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND t.status = 'upcoming'
    )
  );

CREATE POLICY "Pool creators can update bonus questions when upcoming"
  ON public.bonus_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND t.status = 'upcoming'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND t.status = 'upcoming'
    )
  );

CREATE POLICY "Pool creators can delete bonus questions when upcoming"
  ON public.bonus_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pools p
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE p.id = bonus_questions.pool_id
        AND p.creator_id = auth.uid()
        AND t.status = 'upcoming'
    )
  );

-- ---------- bonus_answers ----------
ALTER TABLE public.bonus_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bonus answers viewable by pool members"
  ON public.bonus_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pool_members pm ON pm.pool_id = bq.pool_id
      WHERE bq.id = bonus_answers.bonus_question_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own bonus answers when upcoming"
  ON public.bonus_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE bq.id = bonus_answers.bonus_question_id AND t.status = 'upcoming'
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
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE bq.id = bonus_answers.bonus_question_id AND t.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      JOIN public.tournaments t ON t.id = p.tournament_id
      WHERE bq.id = bonus_answers.bonus_question_id AND t.status = 'upcoming'
    )
  );

-- ---------- bonus_scores ----------
ALTER TABLE public.bonus_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bonus scores viewable by pool members"
  ON public.bonus_scores FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pool_members pm ON pm.pool_id = bq.pool_id
      WHERE bq.id = bonus_scores.bonus_question_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can insert bonus scores"
  ON public.bonus_scores FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_scores.bonus_question_id AND p.creator_id = auth.uid()
    )
  );

CREATE POLICY "Pool creators can update bonus scores"
  ON public.bonus_scores FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_scores.bonus_question_id AND p.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bonus_questions bq
      JOIN public.pools p ON p.id = bq.pool_id
      WHERE bq.id = bonus_scores.bonus_question_id AND p.creator_id = auth.uid()
    )
  );
