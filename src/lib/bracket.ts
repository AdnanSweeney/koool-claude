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
 */
export function generateGroupSourceLabels(
  groupNames: string[],
  advancePerGroup: number,
): string[] {
  const labels: string[] = []
  for (const name of groupNames) {
    // Use first char of group name as prefix (e.g. "Group A" -> "A")
    const prefix = name.replace(/^Group\s*/i, '').charAt(0)
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      labels.push(`${prefix}${pos}`)
    }
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
