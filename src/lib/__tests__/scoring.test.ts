import { describe, it, expect } from 'vitest'
import { computeGroupScore, computeKnockoutScore, computeTotalScore } from '../scoring'

describe('computeGroupScore', () => {
  it('returns 0 when no picks match', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    const actual = [{ group_id: 'g1', advancing_teams: ['C', 'D'] }]
    expect(computeGroupScore(picks, actual)).toBe(0)
  })

  it('returns 1 point per correct advancing team', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    const actual = [{ group_id: 'g1', advancing_teams: ['A', 'C'] }]
    expect(computeGroupScore(picks, actual)).toBe(1)
  })

  it('scores all correct for a group', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    const actual = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    expect(computeGroupScore(picks, actual)).toBe(2)
  })

  it('scores across multiple groups', () => {
    const picks = [
      { group_id: 'g1', advancing_teams: ['A', 'B'] },
      { group_id: 'g2', advancing_teams: ['C', 'D'] },
    ]
    const actual = [
      { group_id: 'g1', advancing_teams: ['A', 'X'] },
      { group_id: 'g2', advancing_teams: ['C', 'D'] },
    ]
    expect(computeGroupScore(picks, actual)).toBe(3)
  })

  it('returns 0 for empty picks', () => {
    expect(computeGroupScore([], [])).toBe(0)
  })

  it('ignores picks for groups without actual results', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A'] }]
    expect(computeGroupScore(picks, [])).toBe(0)
  })
})

describe('computeKnockoutScore', () => {
  it('returns 0 when no results exist', () => {
    const picks = [{ round: 1, matchup_index: 0, picked_team: 'A' }]
    expect(computeKnockoutScore(picks, [])).toBe(0)
  })

  it('scores 1 point for correct R1 pick', () => {
    const picks = [{ round: 1, matchup_index: 0, picked_team: 'A' }]
    const results = [{ round: 1, matchup_index: 0, winning_team: 'A' }]
    expect(computeKnockoutScore(picks, results)).toBe(1)
  })

  it('scores 0 for incorrect pick', () => {
    const picks = [{ round: 1, matchup_index: 0, picked_team: 'A' }]
    const results = [{ round: 1, matchup_index: 0, winning_team: 'B' }]
    expect(computeKnockoutScore(picks, results)).toBe(0)
  })

  it('doubles points each round: R1=1, R2=2, R3=4, R4=8, R5=16', () => {
    const picks = [
      { round: 1, matchup_index: 0, picked_team: 'A' },
      { round: 2, matchup_index: 0, picked_team: 'A' },
      { round: 3, matchup_index: 0, picked_team: 'A' },
      { round: 4, matchup_index: 0, picked_team: 'A' },
      { round: 5, matchup_index: 0, picked_team: 'A' },
    ]
    const results = [
      { round: 1, matchup_index: 0, winning_team: 'A' },
      { round: 2, matchup_index: 0, winning_team: 'A' },
      { round: 3, matchup_index: 0, winning_team: 'A' },
      { round: 4, matchup_index: 0, winning_team: 'A' },
      { round: 5, matchup_index: 0, winning_team: 'A' },
    ]
    expect(computeKnockoutScore(picks, results)).toBe(1 + 2 + 4 + 8 + 16)
  })

  it('scores across multiple matchups in same round', () => {
    const picks = [
      { round: 1, matchup_index: 0, picked_team: 'A' },
      { round: 1, matchup_index: 1, picked_team: 'C' },
    ]
    const results = [
      { round: 1, matchup_index: 0, winning_team: 'A' },
      { round: 1, matchup_index: 1, winning_team: 'D' },
    ]
    expect(computeKnockoutScore(picks, results)).toBe(1)
  })

  it('returns 0 for empty picks', () => {
    expect(computeKnockoutScore([], [])).toBe(0)
  })
})

describe('computeTotalScore', () => {
  it('sums all three score sources', () => {
    expect(computeTotalScore(3, 15, 5)).toBe(23)
  })

  it('returns 0 when all sources are 0', () => {
    expect(computeTotalScore(0, 0, 0)).toBe(0)
  })
})
