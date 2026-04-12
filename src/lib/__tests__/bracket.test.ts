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
  getOptionsForMatchup,
  clearDownstreamPicks,
} from '../bracket'
import type { Pick as PickChoice, KnockoutMatchup } from '@/types'

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

// ─── Helpers for cascade tests ─────────────────────────────────────────────

function makeMatchup(
  round: number,
  idx: number,
  teamA: string | null,
  teamB: string | null,
  srcA?: string,
  srcB?: string,
): KnockoutMatchup {
  return {
    id: `m-${round}-${idx}`,
    pool_id: 'pool-1',
    round,
    matchup_index: idx,
    team_a: teamA,
    team_b: teamB,
    group_source_a: srcA ?? null,
    group_source_b: srcB ?? null,
  }
}

function makePick(round: number, idx: number, team: string): PickChoice {
  return {
    id: `p-${round}-${idx}`,
    pool_id: 'pool-1',
    user_id: 'u1',
    round,
    matchup_index: idx,
    picked_team: team,
    submitted_at: null,
  }
}

// 8-team bracket matchup template (R1 only — R2/R3 are virtual)
const r1Matchups: KnockoutMatchup[] = [
  makeMatchup(1, 0, 'A', 'B'),
  makeMatchup(1, 1, 'C', 'D'),
  makeMatchup(1, 2, 'E', 'F'),
  makeMatchup(1, 3, 'G', 'H'),
]

// ─── getOptionsForMatchup ──────────────────────────────────────────────────

describe('getOptionsForMatchup', () => {
  it('R1: returns teams from matchup record', () => {
    expect(getOptionsForMatchup(1, 0, [], r1Matchups)).toEqual(['A', 'B'])
    expect(getOptionsForMatchup(1, 2, [], r1Matchups)).toEqual(['E', 'F'])
  })

  it('R1: returns group source labels when teams are null', () => {
    const m = [makeMatchup(1, 0, null, null, 'A1', 'B2')]
    expect(getOptionsForMatchup(1, 0, [], m)).toEqual(['A1', 'B2'])
  })

  it('R1: returns [null, null] for missing matchup record', () => {
    expect(getOptionsForMatchup(1, 99, [], r1Matchups)).toEqual([null, null])
  })

  it('R2: returns winners from R1 picks', () => {
    const picks = [makePick(1, 0, 'A'), makePick(1, 1, 'D')]
    // R2 matchup 0 is fed by R1[0] and R1[1]
    expect(getOptionsForMatchup(2, 0, picks, r1Matchups)).toEqual(['A', 'D'])
  })

  it('R2: returns [team, null] when only one feeder is picked', () => {
    const picks = [makePick(1, 0, 'A')]  // R1[1] not picked yet
    expect(getOptionsForMatchup(2, 0, picks, r1Matchups)).toEqual(['A', null])
  })

  it('R2: returns [null, null] when no feeders picked', () => {
    expect(getOptionsForMatchup(2, 0, [], r1Matchups)).toEqual([null, null])
  })

  it('R3 (final): returns R2 winners', () => {
    const picks = [
      makePick(1, 0, 'A'), makePick(1, 1, 'D'),
      makePick(1, 2, 'E'), makePick(1, 3, 'H'),
      makePick(2, 0, 'A'), makePick(2, 1, 'H'),
    ]
    expect(getOptionsForMatchup(3, 0, picks, r1Matchups)).toEqual(['A', 'H'])
  })
})

// ─── clearDownstreamPicks ──────────────────────────────────────────────────

describe('clearDownstreamPicks', () => {
  it('no-op when at final round', () => {
    const picks = [makePick(3, 0, 'A')]
    expect(clearDownstreamPicks(picks, 3, 0, 3)).toEqual(picks)
  })

  it('no-op when downstream pick is still valid', () => {
    // R1[0]=A, R1[1]=D, R2[0]=A. Change R1[1] to C — R2[0]=A is still valid (A came from R1[0])
    const picks = [makePick(1, 0, 'A'), makePick(1, 1, 'C'), makePick(2, 0, 'A')]
    const result = clearDownstreamPicks(picks, 1, 1, 3)
    expect(result).toHaveLength(3)
    expect(result.find((p) => p.round === 2 && p.matchup_index === 0)?.picked_team).toBe('A')
  })

  it('clears R2 pick when R1 change makes it invalid', () => {
    // R1[0]=A → changed to E; R2[0]=A (invalid — A no longer came through)
    const picks = [makePick(1, 0, 'E'), makePick(1, 1, 'D'), makePick(2, 0, 'A')]
    const result = clearDownstreamPicks(picks, 1, 0, 3)
    expect(result.find((p) => p.round === 2 && p.matchup_index === 0)).toBeUndefined()
  })

  it('cascades: R1 change clears R2 and R3', () => {
    const picks = [
      makePick(1, 0, 'E'), // changed from A to E
      makePick(1, 1, 'D'),
      makePick(1, 2, 'F'),
      makePick(1, 3, 'H'),
      makePick(2, 0, 'A'), // invalid: A no longer in R2[0]
      makePick(2, 1, 'F'),
      makePick(3, 0, 'A'), // invalid: A cleared from R2[0]
    ]
    const result = clearDownstreamPicks(picks, 1, 0, 3)
    expect(result.find((p) => p.round === 2 && p.matchup_index === 0)).toBeUndefined()
    expect(result.find((p) => p.round === 3 && p.matchup_index === 0)).toBeUndefined()
    // R2[1] and other unrelated picks remain
    expect(result.find((p) => p.round === 2 && p.matchup_index === 1)?.picked_team).toBe('F')
    expect(result).toHaveLength(5)
  })

  it('does not clear unrelated downstream picks', () => {
    // Change R1[2]; R2[0] and R3[0] are on the other side of the bracket
    const picks = [
      makePick(1, 0, 'A'),
      makePick(1, 1, 'D'),
      makePick(1, 2, 'F'), // changed from E
      makePick(1, 3, 'H'),
      makePick(2, 0, 'A'), // fed by R1[0] and R1[1] — unaffected
      makePick(2, 1, 'E'), // fed by R1[2] and R1[3] — E is now invalid
      makePick(3, 0, 'A'),
    ]
    const result = clearDownstreamPicks(picks, 1, 2, 3)
    // R2[1]=E cleared (E came from R1[2] which now picks F)
    expect(result.find((p) => p.round === 2 && p.matchup_index === 1)).toBeUndefined()
    // R3[0]=A remains (A still valid from R2[0])
    expect(result.find((p) => p.round === 3 && p.matchup_index === 0)?.picked_team).toBe('A')
  })

  it('4-team bracket: changing R1 clears the final', () => {
    const picks = [
      makePick(1, 0, 'X'), // changed from A
      makePick(1, 1, 'C'),
      makePick(2, 0, 'A'), // invalid
    ]
    const result = clearDownstreamPicks(picks, 1, 0, 2)
    expect(result.find((p) => p.round === 2)).toBeUndefined()
  })

  it('16-team bracket: full cascade through 4 rounds', () => {
    // Build a full 16-team bracket with picks all the way through
    const allPicks: PickChoice[] = [
      // R1 (8 matchups)
      makePick(1, 0, 'T1'),  // change this one
      makePick(1, 1, 'T4'),
      makePick(1, 2, 'T5'),
      makePick(1, 3, 'T8'),
      makePick(1, 4, 'T9'),
      makePick(1, 5, 'T12'),
      makePick(1, 6, 'T13'),
      makePick(1, 7, 'T16'),
      // R2 (4 matchups)
      makePick(2, 0, 'T1'),  // feeds from R1[0]+R1[1] — T1 invalid after change
      makePick(2, 1, 'T5'),
      makePick(2, 2, 'T9'),
      makePick(2, 3, 'T13'),
      // R3 (2 matchups)
      makePick(3, 0, 'T1'),  // feeds from R2[0]+R2[1] — T1 invalid
      makePick(3, 1, 'T9'),
      // R4 final
      makePick(4, 0, 'T1'),  // invalid
    ]

    // Change R1[0] from T1 to T2
    const changedPicks = allPicks.map((p) =>
      p.round === 1 && p.matchup_index === 0 ? { ...p, picked_team: 'T2' } : p,
    )

    const result = clearDownstreamPicks(changedPicks, 1, 0, 4)

    expect(result.find((p) => p.round === 2 && p.matchup_index === 0)).toBeUndefined()
    expect(result.find((p) => p.round === 3 && p.matchup_index === 0)).toBeUndefined()
    expect(result.find((p) => p.round === 4 && p.matchup_index === 0)).toBeUndefined()
    // Unrelated picks survive
    expect(result.find((p) => p.round === 2 && p.matchup_index === 1)?.picked_team).toBe('T5')
    expect(result.find((p) => p.round === 3 && p.matchup_index === 1)?.picked_team).toBe('T9')
  })
})
