import { describe, it, expect } from 'vitest'
import { computeGroupScore, computeKnockoutScore, computeBonusScore, computeTotalScore } from '../scoring'

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

describe('computeGroupScore with custom groupPts', () => {
  it('awards custom pts per correct pick', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    const actual = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    expect(computeGroupScore(picks, actual, 3)).toBe(6)
  })

  it('awards 0 pts when groupPts is 0', () => {
    const picks = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    const actual = [{ group_id: 'g1', advancing_teams: ['A', 'B'] }]
    expect(computeGroupScore(picks, actual, 0)).toBe(0)
  })
})

describe('computeKnockoutScore with custom knockoutPts', () => {
  it('uses custom pts array instead of doubling pattern', () => {
    const picks = [
      { round: 1, matchup_index: 0, picked_team: 'A' },
      { round: 2, matchup_index: 0, picked_team: 'A' },
      { round: 3, matchup_index: 0, picked_team: 'A' },
    ]
    const results = [
      { round: 1, matchup_index: 0, winning_team: 'A' },
      { round: 2, matchup_index: 0, winning_team: 'A' },
      { round: 3, matchup_index: 0, winning_team: 'A' },
    ]
    expect(computeKnockoutScore(picks, results, [5, 10, 15])).toBe(30)
  })

  it('falls back to 2^(round-1) when round exceeds knockoutPts array', () => {
    const picks = [{ round: 5, matchup_index: 0, picked_team: 'A' }]
    const results = [{ round: 5, matchup_index: 0, winning_team: 'A' }]
    // knockoutPts has 4 entries, round 5 falls back to 2^4 = 16
    expect(computeKnockoutScore(picks, results, [1, 2, 4, 8])).toBe(16)
  })
})

describe('computeBonusScore', () => {
  it('returns 0 for empty scores', () => {
    expect(computeBonusScore([])).toBe(0)
  })

  it('sums points_awarded', () => {
    const scores = [
      { points_awarded: 3 },
      { points_awarded: 5 },
      { points_awarded: 2 },
    ]
    expect(computeBonusScore(scores)).toBe(10)
  })

  it('handles single score', () => {
    expect(computeBonusScore([{ points_awarded: 7 }])).toBe(7)
  })

  it('handles zero points', () => {
    const scores = [{ points_awarded: 0 }, { points_awarded: 0 }]
    expect(computeBonusScore(scores)).toBe(0)
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
