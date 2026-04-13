import type { Pick as PickChoice, KnockoutMatchup } from '@/types'

/**
 * Calculate the number of knockout rounds needed for a given number of teams.
 * For non-power-of-2, rounds up (some teams get byes in R1).
 */
export function getRoundCount(teamCount: number): number {
  if (teamCount < 2) return 0
  return Math.ceil(Math.log2(teamCount))
}

/**
 * Get the number of matchups in a given round.
 * Round 1 has ceil(teamCount/2) matchups, subsequent rounds halve.
 */
export function getMatchupCount(teamCount: number, round: number): number {
  const totalRounds = getRoundCount(teamCount)
  if (round < 1 || round > totalRounds) return 0
  // The final round has 1 matchup. Working backwards:
  // round N (final) = 1 matchup, round N-1 = 2, etc.
  return Math.pow(2, totalRounds - round)
}

/**
 * Get the total number of matchups across all rounds.
 */
export function getTotalMatchups(teamCount: number): number {
  const rounds = getRoundCount(teamCount)
  let total = 0
  for (let r = 1; r <= rounds; r++) {
    total += getMatchupCount(teamCount, r)
  }
  return total
}

/**
 * Calculate how many byes are needed in Round 1.
 * Byes = next power of 2 - teamCount.
 */
export function getByeCount(teamCount: number): number {
  if (teamCount < 2) return 0
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(teamCount)))
  return nextPow2 - teamCount
}

/**
 * Validate that a team count is valid for a knockout bracket (at least 2 teams).
 */
export function isValidTeamCount(teamCount: number): boolean {
  return Number.isInteger(teamCount) && teamCount >= 2
}

/**
 * Given groups with advance_per_group, calculate how many teams enter the knockout.
 */
export function getKnockoutTeamCount(
  groupCount: number,
  advancePerGroup: number,
): number {
  return groupCount * advancePerGroup
}

/**
 * Generate group source labels for knockout matchups fed by group stage.
 * E.g., for 4 groups advancing top 2: ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"]
 *
 * When additionalAdvancing > 0, appends labels "3rd-1", "3rd-2", etc. for
 * best third-place (or Nth-place) teams that also advance.
 */
export function generateGroupSourceLabels(
  groupNames: string[],
  advancePerGroup: number,
  additionalAdvancing: number = 0,
): string[] {
  const labels: string[] = []
  for (const name of groupNames) {
    // Use first char of group name as prefix (e.g. "Group A" -> "A")
    const prefix = name.replace(/^Group\s*/i, '').charAt(0)
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      labels.push(`${prefix}${pos}`)
    }
  }
  for (let i = 1; i <= additionalAdvancing; i++) {
    labels.push(`3rd-${i}`)
  }
  return labels
}

/**
 * Get a human-readable round name.
 */
export function getRoundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return 'Final'
  if (round === totalRounds - 1) return 'Semi-Finals'
  if (round === totalRounds - 2) return 'Quarter-Finals'
  const teamsInRound = Math.pow(2, totalRounds - round + 1)
  return `Round of ${teamsInRound}`
}

/**
 * Get the two team options for a matchup at (round, matchupIndex).
 *
 * - Round 1: returns [team_a/group_source_a, team_b/group_source_b] from the DB matchup record.
 * - Round N > 1: returns the winners picked by the user from the two feeder matchups.
 *   Matchup M in round N is fed by matchups (2*M) and (2*M+1) from round N-1.
 *   If a feeder pick hasn't been made, that slot is null.
 */
export function getOptionsForMatchup(
  round: number,
  matchupIndex: number,
  picks: PickChoice[],
  matchups: KnockoutMatchup[],
): [string | null, string | null] {
  if (round === 1) {
    const matchup = matchups.find((m) => m.round === 1 && m.matchup_index === matchupIndex)
    if (!matchup) return [null, null]
    const teamA = matchup.team_a ?? matchup.group_source_a ?? null
    const teamB = matchup.team_b ?? matchup.group_source_b ?? null
    return [teamA, teamB]
  }

  const feederIdxA = matchupIndex * 2
  const feederIdxB = matchupIndex * 2 + 1

  const pickA = picks.find((p) => p.round === round - 1 && p.matchup_index === feederIdxA)
  const pickB = picks.find((p) => p.round === round - 1 && p.matchup_index === feederIdxB)

  return [pickA?.picked_team ?? null, pickB?.picked_team ?? null]
}

/**
 * When a user changes their pick at (changedRound, changedMatchupIndex), clear any downstream
 * picks that depended on the old winner being available.
 *
 * Walks forward round by round: the affected matchup in the next round is floor(matchupIndex / 2).
 * If the downstream pick is no longer a valid option (no longer one of the two feeder picks),
 * it is removed. Recursion continues until there is nothing to clear or we reach the final.
 */
export function clearDownstreamPicks(
  picks: PickChoice[],
  changedRound: number,
  changedMatchupIndex: number,
  totalRounds: number,
): PickChoice[] {
  if (changedRound >= totalRounds) return picks

  const nextRound = changedRound + 1
  const nextMatchupIndex = Math.floor(changedMatchupIndex / 2)

  // The two feeders for the next matchup come from changedRound
  const feederIdxA = nextMatchupIndex * 2
  const feederIdxB = nextMatchupIndex * 2 + 1

  const feederPickA = picks.find((p) => p.round === changedRound && p.matchup_index === feederIdxA)
  const feederPickB = picks.find((p) => p.round === changedRound && p.matchup_index === feederIdxB)

  const validTeams = new Set<string>()
  if (feederPickA?.picked_team) validTeams.add(feederPickA.picked_team)
  if (feederPickB?.picked_team) validTeams.add(feederPickB.picked_team)

  const downstreamPick = picks.find(
    (p) => p.round === nextRound && p.matchup_index === nextMatchupIndex,
  )

  // If no downstream pick, or if the pick is still a valid option, nothing to clear
  if (!downstreamPick || validTeams.has(downstreamPick.picked_team)) {
    return picks
  }

  // Remove the now-invalid downstream pick
  const updated = picks.filter(
    (p) => !(p.round === nextRound && p.matchup_index === nextMatchupIndex),
  )

  // Recurse to clear further downstream
  return clearDownstreamPicks(updated, nextRound, nextMatchupIndex, totalRounds)
}
