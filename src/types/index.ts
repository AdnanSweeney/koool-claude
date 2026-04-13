export type PoolStatus = 'upcoming' | 'locked' | 'in_progress' | 'completed'

export interface ScoringConfig {
  group: number      // pts per correct advancing team prediction
  knockout: number[] // pts per round, 0-indexed: knockout[0]=R1, knockout[1]=R2, etc.
}

export interface User {
  id: string
  display_name: string
  email: string
  created_at: string
}

export interface Pool {
  id: string
  creator_id: string
  name: string
  description: string | null
  sport: string
  status: PoolStatus
  teams: string[]
  has_group_stage: boolean
  advance_per_group: number | null
  additional_advancing: number
  start_datetime: string
  invite_code: string
  scoring: ScoringConfig
  created_at: string
}

export interface Group {
  id: string
  pool_id: string
  name: string
  teams: string[]
  advancing_teams: string[] | null
}

export interface KnockoutMatchup {
  id: string
  pool_id: string
  round: number
  matchup_index: number
  team_a: string | null
  team_b: string | null
  group_source_a: string | null
  group_source_b: string | null
}

export interface PoolMember {
  pool_id: string
  user_id: string
  joined_at: string
}

export interface GroupPick {
  id: string
  pool_id: string
  user_id: string
  group_id: string
  advancing_teams: string[]
  submitted_at: string | null
}

export interface Pick {
  id: string
  pool_id: string
  user_id: string
  round: number
  matchup_index: number
  picked_team: string
  submitted_at: string | null
}

export interface Result {
  id: string
  pool_id: string
  round: number
  matchup_index: number
  winning_team: string
  entered_by: string
  entered_at: string
}

export interface BonusQuestion {
  id: string
  pool_id: string
  question_text: string
  points: number
  correct_answer: string | null
  created_at: string
}

export interface BonusAnswer {
  id: string
  bonus_question_id: string
  user_id: string
  answer_text: string
  submitted_at: string
  display_name?: string
}

export interface BonusScore {
  id: string
  bonus_question_id: string
  user_id: string
  points_awarded: number
  manually_set: boolean
  set_by: string | null
  set_at: string | null
}
