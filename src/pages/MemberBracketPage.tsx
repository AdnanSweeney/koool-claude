import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { computeGroupScore, computeKnockoutScore, computeBonusScore, computeTotalScore } from '@/lib/scoring'
import BracketCanvas from '@/components/BracketCanvas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { AppHeader } from '@/components/AppHeader'
import type {
  Pool,
  Group as GroupType,
  KnockoutMatchup,
  Pick as PickChoice,
  GroupPick,
  Result,
  BonusQuestion,
  BonusAnswer,
  BonusScore,
} from '@/types'

// ─── Helpers (same resolve logic as PicksPage) ─────────────────────────────

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
    ranking.forEach((team, i) => {
      map.set(`${prefix}${i + 1}`, team)
    })
  }
  thirdPlaceSelections.forEach((team, i) => {
    map.set(`3rd-${i + 1}`, team)
  })
  return map
}

function resolvePicks(
  picks: PickChoice[],
  sourceMap: Map<string, string>,
): PickChoice[] {
  if (sourceMap.size === 0) return picks
  return picks.map((p) => {
    const resolved = sourceMap.get(p.picked_team)
    return resolved ? { ...p, picked_team: resolved } : p
  })
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MemberBracketPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const navigate = useNavigate()

  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)

  // Member's data
  const [memberPicks, setMemberPicks] = useState<PickChoice[]>([])
  const [memberGroupPicks, setMemberGroupPicks] = useState<GroupPick[]>([])
  const [groupRankings, setGroupRankings] = useState<Map<string, string[]>>(new Map())
  const [thirdPlaceSelections, setThirdPlaceSelections] = useState<string[]>([])

  // Bonus
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestion[]>([])
  const [bonusAnswers, setBonusAnswers] = useState<Map<string, string>>(new Map()) // questionId → answer
  const [bonusScoreMap, setBonusScoreMap] = useState<Map<string, number>>(new Map()) // questionId → points

  // Scores
  const [groupPts, setGroupPts] = useState(0)
  const [bracketPts, setBracketPts] = useState(0)
  const [bonusPts, setBonusPts] = useState(0)
  const [totalPts, setTotalPts] = useState(0)

  useEffect(() => {
    if (!id || !userId) return

    async function load() {
      const [poolRes, groupsRes, matchupsRes, resultsRes, userRes, picksRes, groupPicksRes, bqRes] =
        await Promise.all([
          supabase.from('pools').select('*').eq('id', id!).single(),
          supabase.from('groups').select('*').eq('pool_id', id!).order('name'),
          supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
          supabase.from('results').select('*').eq('pool_id', id!),
          supabase.from('users').select('display_name').eq('id', userId!).single(),
          supabase.from('picks').select('*').eq('pool_id', id!).eq('user_id', userId!),
          supabase.from('group_picks').select('*').eq('pool_id', id!).eq('user_id', userId!),
          supabase.from('bonus_questions').select('*').eq('pool_id', id!).order('created_at'),
        ])

      if (!poolRes.data) {
        toast.error('Pool not found')
        navigate('/dashboard')
        return
      }

      const typedPool = poolRes.data as Pool
      setPool(typedPool)

      const typedGroups = (groupsRes.data ?? []) as GroupType[]
      setGroups(typedGroups)
      setMatchups((matchupsRes.data ?? []) as KnockoutMatchup[])
      const typedResults = (resultsRes.data ?? []) as Result[]
      setResults(typedResults)

      const typedPicks = (picksRes.data ?? []) as PickChoice[]
      setMemberPicks(typedPicks)
      const typedGroupPicks = (groupPicksRes.data ?? []) as GroupPick[]
      setMemberGroupPicks(typedGroupPicks)

      // Build group rankings from member's group picks
      const rankMap = new Map<string, string[]>()
      for (const group of typedGroups) {
        const gp = typedGroupPicks.find((p) => p.group_id === group.id)
        if (gp) {
          const saved = gp.advancing_teams as string[]
          const all = group.teams as string[]
          if (saved.length === all.length) {
            rankMap.set(group.id, saved)
          } else {
            const rest = all.filter((t) => !saved.includes(t))
            rankMap.set(group.id, [...saved, ...rest])
          }
        } else {
          rankMap.set(group.id, [...(group.teams as string[])])
        }
      }
      setGroupRankings(rankMap)

      // Restore third-place selections
      if ((typedPool.additional_advancing ?? 0) > 0) {
        const tpRes = await supabase
          .from('third_place_picks')
          .select('selected_teams')
          .eq('pool_id', id!)
          .eq('user_id', userId!)
          .maybeSingle()
        if (tpRes.data?.selected_teams) {
          setThirdPlaceSelections(tpRes.data.selected_teams as string[])
        }
      }

      // Bonus data
      const questions = (bqRes.data ?? []) as BonusQuestion[]
      setBonusQuestions(questions)

      if (questions.length > 0) {
        const qIds = questions.map((q) => q.id)
        const [answersRes, scoresRes] = await Promise.all([
          supabase.from('bonus_answers').select('*').in('bonus_question_id', qIds).eq('user_id', userId!),
          supabase.from('bonus_scores').select('*').in('bonus_question_id', qIds).eq('user_id', userId!),
        ])

        const aMap = new Map<string, string>()
        for (const a of (answersRes.data ?? []) as BonusAnswer[]) {
          aMap.set(a.bonus_question_id, a.answer_text)
        }
        setBonusAnswers(aMap)

        const sMap = new Map<string, number>()
        for (const s of (scoresRes.data ?? []) as BonusScore[]) {
          sMap.set(s.bonus_question_id, s.points_awarded)
        }
        setBonusScoreMap(sMap)
      }

      // Compute scores
      const actualAdvancing = typedGroups
        .filter((g) => g.advancing_teams && g.advancing_teams.length > 0)
        .map((g) => ({
          group_id: g.id,
          advancing_teams: g.advancing_teams as string[],
        }))

      const groupPickData = typedGroupPicks.map((gp) => ({
        group_id: gp.group_id,
        advancing_teams: (gp.advancing_teams as string[]).slice(0, typedPool.advance_per_group ?? 1),
      }))

      const gPts = computeGroupScore(groupPickData, actualAdvancing, typedPool.scoring.group)
      const bPts = computeKnockoutScore(typedPicks, typedResults, typedPool.scoring.knockout)

      // Fetch bonus scores for this user (may already be loaded above, but safe to re-query)
      let bnPts = 0
      if (questions.length > 0) {
        const qIds = questions.map((q) => q.id)
        const bsRes = await supabase
          .from('bonus_scores')
          .select('points_awarded')
          .in('bonus_question_id', qIds)
          .eq('user_id', userId!)
        bnPts = computeBonusScore((bsRes.data ?? []) as Array<{ points_awarded: number }>)
      }

      setGroupPts(gPts)
      setBracketPts(bPts)
      setBonusPts(bnPts)
      setTotalPts(computeTotalScore(gPts, bPts, bnPts))

      setLoading(false)
    }

    load().catch((err) => {
      console.error('[MemberBracketPage] load error:', err)
      toast.error('Failed to load member bracket')
      setLoading(false)
    })
  }, [id, userId, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-5xl space-y-6 px-6 md:px-12 py-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  const teamCount =
    pool.has_group_stage && pool.advance_per_group
      ? groups.length * pool.advance_per_group + (pool.additional_advancing ?? 0)
      : (pool.teams as string[]).length

  const sourceMap = buildGroupSourceMap(groups, groupRankings, thirdPlaceSelections)

  return (
    <div className="min-h-screen bg-background">
      <AppHeader right={
        <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${pool.id}`)}>
          &larr; Pool
        </Button>
      } />

      <main className="mx-auto max-w-5xl space-y-8 px-6 md:px-12 py-8">
        {/* Score summary */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{totalPts}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <Separator orientation="vertical" className="h-10" />
              {pool.has_group_stage && (
                <>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{groupPts}</p>
                    <p className="text-xs text-muted-foreground">Group</p>
                  </div>
                </>
              )}
              <div className="text-center">
                <p className="text-lg font-semibold">{bracketPts}</p>
                <p className="text-xs text-muted-foreground">Bracket</p>
              </div>
              {bonusPts > 0 && (
                <div className="text-center">
                  <p className="text-lg font-semibold">{bonusPts}</p>
                  <p className="text-xs text-muted-foreground">Bonus</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Group stage rankings with color coding */}
        {pool.has_group_stage && groups.length > 0 && memberGroupPicks.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Group Predictions</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="inline-block h-3 w-3 rounded-sm bg-green-500/30" /> Correctly predicted advancing &nbsp;
              <span className="inline-block h-3 w-3 rounded-sm bg-red-500/30" /> Incorrectly predicted &nbsp;
              <span className="inline-block h-3 w-3 rounded-sm bg-muted" /> Pending
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((group) => {
                const ranking = groupRankings.get(group.id) ?? (group.teams as string[])
                const advanceCount = pool.advance_per_group ?? 1
                const actualAdvancing = group.advancing_teams as string[] | null

                return (
                  <div key={group.id} className="overflow-hidden rounded-md border border-border">
                    <div className="border-b border-border bg-muted/50 px-3 py-2">
                      <h4 className="text-sm font-semibold">{group.name}</h4>
                    </div>
                    <div className="divide-y divide-border">
                      {ranking.map((team, i) => {
                        const predicted = i < advanceCount
                        let bgColor = ''
                        if (actualAdvancing && actualAdvancing.length > 0) {
                          const actuallyAdvanced = actualAdvancing.includes(team)
                          if (predicted && actuallyAdvanced) bgColor = 'bg-green-500/15'
                          else if (predicted && !actuallyAdvanced) bgColor = 'bg-red-500/15'
                          else if (!predicted && actuallyAdvanced) bgColor = 'bg-red-500/10'
                        }

                        return (
                          <div
                            key={team}
                            className={cn('flex items-center gap-2 px-3 py-2', bgColor)}
                          >
                            <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="w-4" />
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
          </section>
        )}

        {/* Bracket picks */}
        {matchups.length > 0 && memberPicks.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">Bracket Picks</h2>
            <BracketCanvas
              matchups={resolveMatchupTeams(matchups, groups, groupRankings, thirdPlaceSelections)}
              teamCount={teamCount}
              mode="view"
              picks={resolvePicks(memberPicks, sourceMap)}
              results={results}
            />
          </section>
        )}

        {/* Bonus answers */}
        {bonusQuestions.length > 0 && (
          <>
            <Separator />
            <section>
              <h2 className="mb-4 text-lg font-semibold">Bonus Questions</h2>
              <div className="space-y-3">
                {bonusQuestions.map((q) => {
                  const answer = bonusAnswers.get(q.id)
                  const points = bonusScoreMap.get(q.id)

                  return (
                    <Card key={q.id}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{q.question_text}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Answer: {answer ?? <span className="italic">No answer</span>}
                            </p>
                            {q.correct_answer && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Correct: {q.correct_answer}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {q.points} pt{q.points !== 1 ? 's' : ''}
                            </Badge>
                            {points !== undefined && points > 0 && (
                              <Badge variant="default">+{points}</Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
