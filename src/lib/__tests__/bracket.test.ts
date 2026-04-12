import { describe, it, expect } from 'vitest'
import {
  getRoundCount,
  getMatchupCount,
  getTotalMatchups,
  getByeCount,
  isValidTeamCount,
  getKnockoutTeamCount,
  generateGroupSourceLabels,
  getRoundName,
} from '../bracket'

describe('getRoundCount', () => {
  it('returns 0 for less than 2 teams', () => {
    expect(getRoundCount(0)).toBe(0)
    expect(getRoundCount(1)).toBe(0)
  })

  it('returns 1 for 2 teams', () => {
    expect(getRoundCount(2)).toBe(1)
  })

  it('returns 3 for 8 teams (power of 2)', () => {
    expect(getRoundCount(8)).toBe(3)
  })

  it('returns 4 for 16 teams', () => {
    expect(getRoundCount(16)).toBe(4)
  })

  it('returns 5 for 32 teams', () => {
    expect(getRoundCount(32)).toBe(5)
  })

  it('rounds up for non-power-of-2: 6 teams = 3 rounds', () => {
    expect(getRoundCount(6)).toBe(3)
  })

  it('handles 3 teams = 2 rounds', () => {
    expect(getRoundCount(3)).toBe(2)
  })
})

describe('getMatchupCount', () => {
  it('returns 0 for invalid round', () => {
    expect(getMatchupCount(8, 0)).toBe(0)
    expect(getMatchupCount(8, 5)).toBe(0)
  })

  it('8 teams: R1=4, R2=2, R3=1', () => {
    expect(getMatchupCount(8, 1)).toBe(4)
    expect(getMatchupCount(8, 2)).toBe(2)
    expect(getMatchupCount(8, 3)).toBe(1)
  })

  it('16 teams: R1=8, R2=4, R3=2, R4=1', () => {
    expect(getMatchupCount(16, 1)).toBe(8)
    expect(getMatchupCount(16, 2)).toBe(4)
    expect(getMatchupCount(16, 3)).toBe(2)
    expect(getMatchupCount(16, 4)).toBe(1)
  })

  it('final round always has 1 matchup', () => {
    expect(getMatchupCount(4, 2)).toBe(1)
    expect(getMatchupCount(32, 5)).toBe(1)
  })
})

describe('getTotalMatchups', () => {
  it('returns 0 for < 2 teams', () => {
    expect(getTotalMatchups(1)).toBe(0)
  })

  it('8 teams = 7 total matchups', () => {
    expect(getTotalMatchups(8)).toBe(7)
  })

  it('16 teams = 15 total matchups', () => {
    expect(getTotalMatchups(16)).toBe(15)
  })

  it('2 teams = 1 matchup', () => {
    expect(getTotalMatchups(2)).toBe(1)
  })
})

describe('getByeCount', () => {
  it('returns 0 for power-of-2 team counts', () => {
    expect(getByeCount(2)).toBe(0)
    expect(getByeCount(4)).toBe(0)
    expect(getByeCount(8)).toBe(0)
    expect(getByeCount(16)).toBe(0)
  })

  it('returns correct byes for non-power-of-2', () => {
    expect(getByeCount(3)).toBe(1)
    expect(getByeCount(5)).toBe(3)
    expect(getByeCount(6)).toBe(2)
    expect(getByeCount(7)).toBe(1)
  })

  it('returns 0 for < 2 teams', () => {
    expect(getByeCount(0)).toBe(0)
    expect(getByeCount(1)).toBe(0)
  })
})

describe('isValidTeamCount', () => {
  it('requires at least 2 integer teams', () => {
    expect(isValidTeamCount(2)).toBe(true)
    expect(isValidTeamCount(32)).toBe(true)
    expect(isValidTeamCount(1)).toBe(false)
    expect(isValidTeamCount(0)).toBe(false)
    expect(isValidTeamCount(2.5)).toBe(false)
  })
})

describe('getKnockoutTeamCount', () => {
  it('calculates advancing teams from groups', () => {
    expect(getKnockoutTeamCount(4, 2)).toBe(8)
    expect(getKnockoutTeamCount(8, 1)).toBe(8)
    expect(getKnockoutTeamCount(4, 3)).toBe(12)
  })
})

describe('generateGroupSourceLabels', () => {
  it('generates labels for groups advancing top 2', () => {
    const labels = generateGroupSourceLabels(['Group A', 'Group B'], 2)
    expect(labels).toEqual(['A1', 'A2', 'B1', 'B2'])
  })

  it('generates labels for groups advancing top 1', () => {
    const labels = generateGroupSourceLabels(['Group A', 'Group B', 'Group C', 'Group D'], 1)
    expect(labels).toEqual(['A1', 'B1', 'C1', 'D1'])
  })

  it('handles single-char group names', () => {
    const labels = generateGroupSourceLabels(['A', 'B'], 2)
    expect(labels).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
})

describe('getRoundName', () => {
  it('returns Final for last round', () => {
    expect(getRoundName(3, 3)).toBe('Final')
  })

  it('returns Semi-Finals for second-to-last', () => {
    expect(getRoundName(2, 3)).toBe('Semi-Finals')
  })

  it('returns Quarter-Finals for third-to-last', () => {
    expect(getRoundName(2, 4)).toBe('Quarter-Finals')
  })

  it('returns Round of N for earlier rounds', () => {
    expect(getRoundName(1, 5)).toBe('Round of 32')
    expect(getRoundName(1, 4)).toBe('Round of 16')
  })
})
