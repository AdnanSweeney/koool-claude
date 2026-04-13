-- Add support for additional advancing teams from group stage
-- (e.g. best 8 third-place teams in a World Cup format)
ALTER TABLE pools ADD COLUMN additional_advancing int DEFAULT 0;
