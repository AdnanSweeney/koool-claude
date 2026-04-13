/**
 * Score group picks: groupPts points per correctly predicted advancing team.
 */
export function computeGroupScore(
  userGroupPicks: Array<{ group_id: string; advancing_teams: string[] }>,
  actualAdvancing: Array<{ group_id: string; advancing_teams: string[] }>,
  groupPts: number = 1,
): number {
  let score = 0
  for (const pick of userGroupPicks) {
    const actual = actualAdvancing.find((a) => a.group_id === pick.group_id)
    if (!actual) continue
    for (const team of pick.advancing_teams) {
      if (actual.advancing_teams.includes(team)) {
        score += groupPts
      }
    }
  }
  return score
}

/**
 * Score knockout picks.
 * knockoutPts[round-1] gives the points for that round.
 * Falls back to 2^(round-1) if the round exceeds the configured array.
 */
export function computeKnockoutScore(
  userPicks: Array<{ round: number; matchup_index: number; picked_team: string }>,
  results: Array<{ round: number; matchup_index: number; winning_team: string }>,
  knockoutPts: number[] = [1, 2, 4, 8],
): number {
  let score = 0
  for (const pick of userPicks) {
    const result = results.find(
      (r) => r.round === pick.round && r.matchup_index === pick.matchup_index,
    )
    if (result && result.winning_team === pick.picked_team) {
      score += knockoutPts[pick.round - 1] ?? Math.pow(2, pick.round - 1)
    }
  }
  return score
}

/**
 * Score bonus questions: sum of points_awarded.
 */
export function computeBonusScore(
  bonusScores: Array<{ points_awarded: number }>,
): number {
  return bonusScores.reduce((sum, s) => sum + s.points_awarded, 0)
}

/**
 * Combine all score sources into a total.
 */
export function computeTotalScore(
  groupScore: number,
  knockoutScore: number,
  bonusScore: number,
): number {
  return groupScore + knockoutScore + bonusScore
}
