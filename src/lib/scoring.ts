/**
 * Score group picks: 1 point per correctly predicted advancing team.
 */
export function computeGroupScore(
  userGroupPicks: Array<{ group_id: string; advancing_teams: string[] }>,
  actualAdvancing: Array<{ group_id: string; advancing_teams: string[] }>,
): number {
  let score = 0
  for (const pick of userGroupPicks) {
    const actual = actualAdvancing.find((a) => a.group_id === pick.group_id)
    if (!actual) continue
    for (const team of pick.advancing_teams) {
      if (actual.advancing_teams.includes(team)) {
        score += 1
      }
    }
  }
  return score
}

/**
 * Score knockout picks: 2^(round-1) points per correct pick.
 */
export function computeKnockoutScore(
  userPicks: Array<{ round: number; matchup_index: number; picked_team: string }>,
  results: Array<{ round: number; matchup_index: number; winning_team: string }>,
): number {
  let score = 0
  for (const pick of userPicks) {
    const result = results.find(
      (r) => r.round === pick.round && r.matchup_index === pick.matchup_index,
    )
    if (result && result.winning_team === pick.picked_team) {
      score += Math.pow(2, pick.round - 1)
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
