export type TournamentStatus = 'upcoming' | 'locked' | 'in_progress' | 'completed'

export interface User {
  id: string
  display_name: string
  email: string
  created_at: string
}

export interface Tournament {
  id: string
  name: string
  sport: string
  start_datetime: string
  status: TournamentStatus
  teams: string[]
  created_at: string
}

export interface Pool {
  id: string
  tournament_id: string
  creator_id: string
  name: string
  description: string | null
  invite_code: string
  created_at: string
}

export interface PoolMember {
  pool_id: string
  user_id: string
  joined_at: string
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
  tournament_id: string
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
