-- Store users' third-place team predictions and creator's actual results
CREATE TABLE public.third_place_picks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  selected_teams  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ordered array of team names
  submitted_at    timestamptz,
  UNIQUE (pool_id, user_id)
);

ALTER TABLE public.third_place_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Third place picks viewable by pool members"
  ON public.third_place_picks FOR SELECT
  TO authenticated
  USING (is_pool_member(pool_id));

CREATE POLICY "Users can insert own third place picks when upcoming"
  ON public.third_place_picks FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = third_place_picks.pool_id AND p.status = 'upcoming'
    )
  );

CREATE POLICY "Users can update own third place picks when upcoming"
  ON public.third_place_picks FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = third_place_picks.pool_id AND p.status = 'upcoming'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pools p
      WHERE p.id = third_place_picks.pool_id AND p.status = 'upcoming'
    )
  );
