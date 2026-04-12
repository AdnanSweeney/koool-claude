-- ============================================================
-- Seed: 2026 FIFA World Cup knockout stage
-- ============================================================

INSERT INTO public.tournaments (name, sport, start_datetime, status, teams)
VALUES (
  '2026 FIFA World Cup',
  'Football',
  '2026-07-05T16:00:00Z',
  'upcoming',
  '["Argentina", "France", "Brazil", "England", "Germany", "Spain", "Netherlands", "Portugal", "Belgium", "Croatia", "Uruguay", "Colombia", "Mexico", "USA", "Japan", "South Korea", "Senegal", "Morocco", "Australia", "Switzerland", "Denmark", "Serbia", "Poland", "Ecuador", "Canada", "Wales", "Cameroon", "Ghana", "Tunisia", "Saudi Arabia", "Iran", "Costa Rica"]'::jsonb
);
