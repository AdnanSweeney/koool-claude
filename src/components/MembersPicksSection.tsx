import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import {
  computeGroupScore,
  computeKnockoutScore,
  computeBonusScore,
  computeTotalScore,
} from '@/lib/scoring'
import { getRoundCount } from '@/lib/bracket'
import BracketCanvas from '@/components/BracketCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type {
  Pool,
  Group as GroupType,
  KnockoutMatchup,
  Pick as PickChoice,
  GroupPick,
  Result,
  BonusQuestion,
} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberEntry {
  user_id: string
  display_name: string
  has_submitted: boolean
  group_pts: number
  bracket_pts: number
  bonus_pts: number
  total: number
  knockout_picks: PickChoice[]
  group_picks: GroupPick[]
  third_place_selections: string[]
  bonus_answers: Map<string, string>   // questionId → answer text
  bonus_score_map: Map<string, number> // questionId → pts awarded
}

interface Props {
  pool: Pool
  groups: GroupType[]
  matchups: KnockoutMatchup[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveGroupSource(
  source: string | null,
  groups: GroupType[],
  groupRankings: Map<string, string[]>,
  thirdPlaceSelections: string[] = [],
): string | null {
  if (!source) return null
  const thirdMatch = source.match(/^3rd-(\d+)$/)
  if (thirdMatch) {
    const idx = parseInt(thirdMatch[1], 10) - 1
    return thirdPlaceSelections[idx] ?? source
  }
  const prefix = source.charAt(0)
  const pos = parseInt(source.slice(1), 10)
  if (isNaN(pos) || pos < 1) return source
  const group = groups.find(
    (g) => g.name.replace(/^Group\s*/i, '').charAt(0).toUpperCase() === prefix.toUpperCase(),
  )
  if (!group) return source
  const ranking = groupRankings.get(group.id)
  if (!ranking || ranking.length < pos) return source
  return ranking[pos - 1] ?? source
}

function buildGroupSourceMap(
  groups: GroupType[],
  groupRankings: Map<string, string[]>,
  thirdPlaceSelections: string[] = [],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const group of groups) {
    const prefix = group.name.replace(/^Group\s*/i, '').charAt(0).toUpperCase()
    const ranking = groupRankings.get(group.id)
    if (!ranking) continue
    ranking.forEach((team, i) => map.set(`${prefix}${i + 1}`, team))
  }
  thirdPlaceSelections.forEach((team, i) => map.set(`3rd-${i + 1}`, team))
  return map
}

function resolveMatchupTeams(
  matchups: KnockoutMatchup[],
  groups: GroupType[],
  groupRankings: Map<string, string[]>,
  thirdPlaceSelections: string[] = [],
): KnockoutMatchup[] {
  if (groups.length === 0) return matchups
  return matchups.map((m) => ({
    ...m,
    team_a: m.group_source_a
      ? resolveGroupSource(m.group_source_a, groups, groupRankings, thirdPlaceSelections) ?? m.team_a
      : m.team_a,
    team_b: m.group_source_b
      ? resolveGroupSource(m.group_source_b, groups, groupRankings, thirdPlaceSelections) ?? m.team_b
      : m.team_b,
  }))
}

function resolvePicks(picks: PickChoice[], sourceMap: Map<string, string>): PickChoice[] {
  if (sourceMap.size === 0) return picks
  return picks.map((p) => {
    const resolved = sourceMap.get(p.picked_team)
    return resolved ? { ...p, picked_team: resolved } : p
  })
}

function buildRankingsFromGroupPicks(
  groups: GroupType[],
  groupPicks: GroupPick[],
): Map<string, string[]> {
  const rankMap = new Map<string, string[]>()
  for (const group of groups) {
    const gp = groupPicks.find((p) => p.group_id === group.id)
    const all = group.teams as string[]
    if (!gp) {
      rankMap.set(group.id, [...all])
    } else {
      const saved = gp.advancing_teams as string[]
      if (saved.length === all.length) {
        rankMap.set(group.id, saved)
      } else {
        const rest = all.filter((t) => !saved.includes(t))
        rankMap.set(group.id, [...saved, ...rest])
      }
    }
  }
  return rankMap
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MembersPicksSection({ pool, groups, matchups }: Props) {
  const session = useAuthStore((s) => s.session)
  const [members, setMembers] = useState<MemberEntry[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserSubmitted, setCurrentUserSubmitted] = useState(false)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  const teamCount =
    pool.has_group_stage && pool.advance_per_group
      ? groups.length * pool.advance_per_group + (pool.additional_advancing ?? 0)
      : (pool.teams as string[]).length

  const totalRounds = getRoundCount(teamCount)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    async function load() {
      const [membersRes, allPicksRes, allGroupPicksRes, allThirdPlaceRes, resultsRes, bqRes] =
        await Promise.all([
          supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', pool.id),
          supabase.from('picks').select('*').eq('pool_id', pool.id).not('submitted_at', 'is', null),
          supabase.from('group_picks').select('*').eq('pool_id', pool.id).not('submitted_at', 'is', null),
          supabase.from('third_place_picks').select('*').eq('pool_id', pool.id),
          supabase.from('results').select('*').eq('pool_id', pool.id),
          supabase.from('bonus_questions').select('*').eq('pool_id', pool.id).order('created_at'),
        ])

      const typedResults = (resultsRes.data ?? []) as Result[]
      setResults(typedResults)

      const questions = (bqRes.data ?? []) as BonusQuestion[]
      setBonusQuestions(questions)

      let allBonusAnswers: Array<{ bonus_question_id: string; user_id: string; answer_text: string }> = []
      let allBonusScores: Array<{ bonus_question_id: string; user_id: string; points_awarded: number }> = []
      if (questions.length > 0) {
        const qIds = questions.map((q) => q.id)
        const [baRes, bsRes] = await Promise.all([
          supabase.from('bonus_answers').select('*').in('bonus_question_id', qIds),
          supabase.from('bonus_scores').select('*').in('bonus_question_id', qIds),
        ])
        allBonusAnswers = (baRes.data ?? []) as typeof allBonusAnswers
        allBonusScores = (bsRes.data ?? []) as typeof allBonusScores
      }

      const allPicks = (allPicksRes.data ?? []) as PickChoice[]
      const allGroupPicks = (allGroupPicksRes.data ?? []) as GroupPick[]
      const thirdPlaceData = (allThirdPlaceRes.data ?? []) as Array<{ user_id: string; selected_teams: string[] }>

      // Check if current user has submitted
      const myPicks = allPicks.filter((p) => p.user_id === userId)
      const myGroupPicks = allGroupPicks.filter((p) => p.user_id === userId)
      const submitted = myPicks.length > 0 || myGroupPicks.length > 0
      setCurrentUserSubmitted(submitted)

      // Build actual advancing for group scoring
      const actualAdvancing = groups
        .filter((g) => g.advancing_teams && g.advancing_teams.length > 0)
        .map((g) => ({
          group_id: g.id,
          advancing_teams: g.advancing_teams as string[],
        }))

      // Build entries for each member
      const entries: MemberEntry[] = []
      for (const m of membersRes.data ?? []) {
        const user = m.users as unknown as { display_name: string } | null
        const memberId = m.user_id

        const kPicks = allPicks.filter((p) => p.user_id === memberId)
        const gPicks = allGroupPicks.filter((p) => p.user_id === memberId)
        const tpPick = thirdPlaceData.find((tp) => tp.user_id === memberId)

        const hasSubmitted = kPicks.length > 0 || gPicks.length > 0

        // Build bonus answer/score maps for this member
        const bonusAnswerMap = new Map<string, string>()
        for (const a of allBonusAnswers.filter((a) => a.user_id === memberId)) {
          bonusAnswerMap.set(a.bonus_question_id, a.answer_text)
        }
        const bonusScoreMap = new Map<string, number>()
        for (const s of allBonusScores.filter((s) => s.user_id === memberId)) {
          bonusScoreMap.set(s.bonus_question_id, s.points_awarded)
        }

        // Compute scores
        const groupPickData = gPicks.map((gp) => ({
          group_id: gp.group_id,
          advancing_teams: (gp.advancing_teams as string[]).slice(0, pool.advance_per_group ?? 1),
        }))
        const groupPts = computeGroupScore(groupPickData, actualAdvancing, pool.scoring.group)
        const bracketPts = computeKnockoutScore(kPicks, typedResults, pool.scoring.knockout)
        const bonusPts = computeBonusScore(
          Array.from(bonusScoreMap.values()).map((pts) => ({ points_awarded: pts })),
        )
        const total = computeTotalScore(groupPts, bracketPts, bonusPts)

        entries.push({
          user_id: memberId,
          display_name: user?.display_name ?? 'Unknown',
          has_submitted: hasSubmitted,
          group_pts: groupPts,
          bracket_pts: bracketPts,
          bonus_pts: bonusPts,
          total,
          knockout_picks: kPicks,
          group_picks: gPicks,
          third_place_selections: (tpPick?.selected_teams ?? []) as string[],
          bonus_answers: bonusAnswerMap,
          bonus_score_map: bonusScoreMap,
        })
      }

      // Sort: submitted first, then by total desc
      entries.sort((a, b) => {
        if (a.has_submitted !== b.has_submitted) return a.has_submitted ? -1 : 1
        return b.total - a.total
      })

      setMembers(entries)
      setLoading(false)
    }

    load().catch(console.error)
  }, [pool.id, pool.scoring, pool.advance_per_group, pool.has_group_stage, pool.additional_advancing, pool.teams, groups, session?.user?.id])

  const isVisible = pool.status !== 'upcoming' || currentUserSubmitted

  const roundLabel = (round: number) => {
    if (totalRounds === 1) return 'Final'
    if (round === totalRounds) return 'Final'
    if (round === totalRounds - 1) return 'Semi'
    if (round === totalRounds - 2) return 'QF'
    return `R${round}`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members' Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Members' Picks</h2>

      {!isVisible ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Submit your picks to see how others picked.
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No members yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const isCurrentUser = member.user_id === session?.user?.id
            const isOpen = expandedMember === member.user_id
            const memberRankings = buildRankingsFromGroupPicks(groups, member.group_picks)
            const memberSourceMap = buildGroupSourceMap(groups, memberRankings, member.third_place_selections)

            return (
              <Card
                key={member.user_id}
                className={cn(isCurrentUser && 'border-primary/40')}
              >
                {/* Header — always visible, click to expand */}
                <CardHeader
                  className="cursor-pointer select-none py-3"
                  onClick={() => setExpandedMember(isOpen ? null : member.user_id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className={cn('text-base truncate', isCurrentUser && 'text-primary')}>
                        {member.display_name}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                        )}
                      </CardTitle>
                      {!member.has_submitted && (
                        <Badge variant="outline" className="shrink-0 text-xs">No picks</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Score breakdown pills */}
                      {member.has_submitted && (
                        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                          {pool.has_group_stage && (
                            <span className={cn(member.group_pts > 0 && 'text-green-600 dark:text-green-400 font-medium')}>
                              Group: {member.group_pts}
                            </span>
                          )}
                          <span className={cn(member.bracket_pts > 0 && 'text-blue-600 dark:text-blue-400 font-medium')}>
                            Bracket: {member.bracket_pts}
                          </span>
                          {member.bonus_pts > 0 && (
                            <span className="text-purple-600 dark:text-purple-400 font-medium">
                              Bonus: {member.bonus_pts}
                            </span>
                          )}
                          <Separator orientation="vertical" className="h-4" />
                          <span className="font-bold text-foreground">{member.total} pts</span>
                        </div>
                      )}

                      {/* Mobile: just total */}
                      {member.has_submitted && (
                        <span className="sm:hidden text-sm font-bold">{member.total} pts</span>
                      )}

                      <span className="text-xs text-muted-foreground">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Mobile score breakdown row */}
                  {member.has_submitted && (
                    <div className="sm:hidden flex gap-3 mt-1 text-xs text-muted-foreground">
                      {pool.has_group_stage && (
                        <span className={cn(member.group_pts > 0 && 'text-green-600 dark:text-green-400 font-medium')}>
                          Group: {member.group_pts}
                        </span>
                      )}
                      <span className={cn(member.bracket_pts > 0 && 'text-blue-600 dark:text-blue-400 font-medium')}>
                        Bracket: {member.bracket_pts}
                      </span>
                      {member.bonus_pts > 0 && (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">
                          Bonus: {member.bonus_pts}
                        </span>
                      )}
                    </div>
                  )}
                </CardHeader>

                {/* Expanded picks view */}
                {isOpen && member.has_submitted && (
                  <CardContent className="space-y-6 border-t pt-4">
                    {/* Detailed score breakdown */}
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Points Breakdown
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {pool.has_group_stage && (
                          <div className="text-center">
                            <p className={cn('text-xl font-bold tabular-nums', member.group_pts > 0 && 'text-green-600 dark:text-green-400')}>
                              {member.group_pts}
                            </p>
                            <p className="text-xs text-muted-foreground">Group ({pool.scoring.group}pt/pick)</p>
                          </div>
                        )}
                        {pool.scoring.knockout.map((pts, i) => {
                          const round = i + 1
                          const roundPicks = member.knockout_picks.filter((p) => p.round === round)
                          const correctPicks = roundPicks.filter((p) =>
                            results.some((r) => r.round === p.round && r.matchup_index === p.matchup_index && r.winning_team === p.picked_team),
                          )
                          if (roundPicks.length === 0 && results.filter((r) => r.round === round).length === 0) return null
                          const roundScore = correctPicks.length * pts
                          return (
                            <div key={round} className="text-center">
                              <p className={cn('text-xl font-bold tabular-nums', roundScore > 0 && 'text-blue-600 dark:text-blue-400')}>
                                {roundScore}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {roundLabel(round)} ({correctPicks.length}/{roundPicks.length || '?'} · {pts}pt)
                              </p>
                            </div>
                          )
                        })}
                        {bonusQuestions.length > 0 && (
                          <div className="text-center">
                            <p className={cn('text-xl font-bold tabular-nums', member.bonus_pts > 0 && 'text-purple-600 dark:text-purple-400')}>
                              {member.bonus_pts}
                            </p>
                            <p className="text-xs text-muted-foreground">Bonus</p>
                          </div>
                        )}
                        <div className="text-center border-l pl-4">
                          <p className="text-2xl font-bold tabular-nums text-primary">{member.total}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                      </div>
                    </div>

                    {/* Group rankings */}
                    {pool.has_group_stage && member.group_picks.length > 0 && groups.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Group Predictions
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {groups.map((group) => {
                            const gp = member.group_picks.find((p) => p.group_id === group.id)
                            if (!gp) return null
                            const ranking = memberRankings.get(group.id) ?? (group.teams as string[])
                            const advanceCount = pool.advance_per_group ?? 1
                            const actualAdvancing = group.advancing_teams as string[] | null

                            return (
                              <div key={group.id} className="overflow-hidden rounded-md border">
                                <div className="border-b bg-muted/50 px-3 py-2">
                                  <p className="text-sm font-semibold">{group.name}</p>
                                </div>
                                <div className="divide-y">
                                  {ranking.map((team, i) => {
                                    const predicted = i < advanceCount
                                    let bgColor = ''
                                    if (actualAdvancing && actualAdvancing.length > 0) {
                                      const actuallyAdvanced = actualAdvancing.includes(team)
                                      if (predicted && actuallyAdvanced) bgColor = 'bg-green-500/15'
                                      else if (predicted && !actuallyAdvanced) bgColor = 'bg-red-500/15'
                                    }
                                    return (
                                      <div
                                        key={team}
                                        className={cn('flex items-center gap-2 px-3 py-2', bgColor)}
                                      >
                                        <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">
                                          {i + 1}
                                        </span>
                                        <span className={cn('flex-1 truncate text-sm', predicted && 'font-medium')}>
                                          {team}
                                        </span>
                                        {predicted && (
                                          <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                                            Advances
                                          </span>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bracket */}
                    {member.knockout_picks.length > 0 && matchups.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Bracket Picks
                        </p>
                        <BracketCanvas
                          matchups={resolveMatchupTeams(
                            matchups,
                            groups,
                            memberRankings,
                            member.third_place_selections,
                          )}
                          teamCount={teamCount}
                          mode="view"
                          picks={resolvePicks(member.knockout_picks, memberSourceMap)}
                          results={results}
                        />
                      </div>
                    )}

                    {/* Bonus answers */}
                    {bonusQuestions.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Bonus Questions
                        </p>
                        <div className="space-y-2">
                          {bonusQuestions.map((q) => {
                            const answer = member.bonus_answers.get(q.id)
                            const ptsAwarded = member.bonus_score_map.get(q.id)
                            return (
                              <div key={q.id} className="rounded-md border px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{q.question_text}</p>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                      {answer ?? <span className="italic">No answer</span>}
                                    </p>
                                    {q.correct_answer && (
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        Correct: {q.correct_answer}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <Badge variant="secondary" className="text-xs">
                                      {q.points}pt
                                    </Badge>
                                    {ptsAwarded !== undefined && ptsAwarded > 0 && (
                                      <Badge variant="default" className="text-xs">
                                        +{ptsAwarded}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}

                {isOpen && !member.has_submitted && (
                  <CardContent className="border-t pt-4 text-sm text-muted-foreground">
                    This member hasn't submitted their picks yet.
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
