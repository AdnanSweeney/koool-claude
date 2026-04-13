import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { getRoundCount, clearDownstreamPicks } from '@/lib/bracket'
import BracketCanvas from '@/components/BracketCanvas'
import GroupRankingTable from '@/components/GroupRankingTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Trash2 } from 'lucide-react'
import type {
  Pool,
  PoolStatus,
  Group as GroupType,
  KnockoutMatchup,
  Result,
  Pick as PickChoice,
  BonusQuestion,
  BonusAnswer,
  BonusScore,
} from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert results to pick-shaped objects so BracketCanvas can display them */
function resultsToPicks(results: Result[], poolId: string, userId: string): PickChoice[] {
  return results.map((r) => ({
    id: r.id,
    pool_id: poolId,
    user_id: userId,
    round: r.round,
    matchup_index: r.matchup_index,
    picked_team: r.winning_team,
    submitted_at: r.entered_at,
  }))
}

/**
 * After group results are saved, resolve group_source labels on knockout matchups
 * to actual team names and persist to DB.
 */
async function populateKnockoutFromGroups(
  matchups: KnockoutMatchup[],
  groups: GroupType[],
  groupRankings: Map<string, string[]>,
  advancePerGroup: number,
  thirdPlaceAssignments: string[] = [],
): Promise<KnockoutMatchup[]> {
  // Build label→team map from group rankings
  const sourceMap = new Map<string, string>()
  for (const group of groups) {
    const prefix = group.name.replace(/^Group\s*/i, '').charAt(0).toUpperCase()
    const ranking = groupRankings.get(group.id)
    if (!ranking) continue
    for (let i = 0; i < advancePerGroup && i < ranking.length; i++) {
      sourceMap.set(`${prefix}${i + 1}`, ranking[i])
    }
  }
  // Add third-place assignments
  thirdPlaceAssignments.forEach((team, i) => {
    sourceMap.set(`3rd-${i + 1}`, team)
  })

  const updated: KnockoutMatchup[] = []
  for (const m of matchups) {
    const teamA = m.group_source_a ? sourceMap.get(m.group_source_a) ?? m.team_a : m.team_a
    const teamB = m.group_source_b ? sourceMap.get(m.group_source_b) ?? m.team_b : m.team_b

    if (teamA !== m.team_a || teamB !== m.team_b) {
      const { error } = await supabase
        .from('knockout_matchups')
        .update({ team_a: teamA, team_b: teamB })
        .eq('id', m.id)
      if (error) throw error
    }
    updated.push({ ...m, team_a: teamA, team_b: teamB })
  }
  return updated
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ManageResultsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Group rankings (drag-to-rank for results entry)
  const [groupRankings, setGroupRankings] = useState<Map<string, string[]>>(new Map())

  // Third-place advancing teams (actual results, assigned by creator)
  const [thirdPlaceAssignments, setThirdPlaceAssignments] = useState<string[]>([])

  // Knockout results as "picks" for BracketCanvas interaction
  const [resultPicks, setResultPicks] = useState<PickChoice[]>([])

  // Bonus questions
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestion[]>([])
  const [bonusAnswers, setBonusAnswers] = useState<Map<string, BonusAnswer[]>>(new Map()) // questionId → answers
  const [bonusScores, setBonusScores] = useState<Map<string, Map<string, number>>>(new Map()) // questionId → userId → points
  const [correctAnswers, setCorrectAnswers] = useState<Map<string, string>>(new Map())

  // New question form
  const [newQuestionText, setNewQuestionText] = useState('')
  const [newQuestionPoints, setNewQuestionPoints] = useState('1')
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null)

  const teamCount =
    pool?.has_group_stage && pool.advance_per_group
      ? groups.length * pool.advance_per_group + (pool.additional_advancing ?? 0)
      : (pool?.teams as string[] | undefined)?.length ?? 0

  const totalRounds = getRoundCount(teamCount)

  // ─── Load data ──────────────────────────────────────────────────────────

  const loadBonusData = useCallback(async (poolId: string, questions: BonusQuestion[]) => {
    if (questions.length === 0) return

    const qIds = questions.map((q) => q.id)
    const [answersRes, scoresRes] = await Promise.all([
      supabase.from('bonus_answers').select('*, users(display_name)').in('bonus_question_id', qIds),
      supabase.from('bonus_scores').select('*').in('bonus_question_id', qIds),
    ])

    // Group answers by question
    const ansMap = new Map<string, BonusAnswer[]>()
    for (const raw of (answersRes.data ?? [])) {
      const a: BonusAnswer = {
        ...(raw as BonusAnswer),
        display_name: (raw.users as { display_name: string } | null)?.display_name ?? 'Unknown',
      }
      const arr = ansMap.get(a.bonus_question_id) ?? []
      arr.push(a)
      ansMap.set(a.bonus_question_id, arr)
    }
    setBonusAnswers(ansMap)

    // Group scores by question → user
    const scoreMap = new Map<string, Map<string, number>>()
    for (const s of (scoresRes.data ?? []) as BonusScore[]) {
      const inner = scoreMap.get(s.bonus_question_id) ?? new Map<string, number>()
      inner.set(s.user_id, s.points_awarded)
      scoreMap.set(s.bonus_question_id, inner)
    }
    setBonusScores(scoreMap)

    // Set correct answers
    const caMap = new Map<string, string>()
    for (const q of questions) {
      if (q.correct_answer) caMap.set(q.id, q.correct_answer)
    }
    setCorrectAnswers(caMap)
  }, [])

  useEffect(() => {
    if (!id || !session?.user) return

    async function load() {
      const [poolRes, groupsRes, matchupsRes, resultsRes, bqRes] = await Promise.all([
        supabase.from('pools').select('*').eq('id', id!).single(),
        supabase.from('groups').select('*').eq('pool_id', id!).order('name'),
        supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
        supabase.from('results').select('*').eq('pool_id', id!),
        supabase.from('bonus_questions').select('*').eq('pool_id', id!).order('created_at'),
      ])

      if (!poolRes.data) {
        toast.error('Pool not found')
        navigate('/dashboard')
        return
      }

      const typedPool = poolRes.data as Pool
      if (typedPool.creator_id !== session!.user.id) {
        toast.error('Only the pool creator can manage results')
        navigate(`/pools/${id}`)
        return
      }

      setPool(typedPool)
      const typedGroups = (groupsRes.data ?? []) as GroupType[]
      setGroups(typedGroups)
      setMatchups((matchupsRes.data ?? []) as KnockoutMatchup[])

      const typedResults = (resultsRes.data ?? []) as Result[]
      setResults(typedResults)
      setResultPicks(resultsToPicks(typedResults, id!, session!.user.id))

      // Initialize group rankings from existing advancing_teams or group teams
      const rankMap = new Map<string, string[]>()
      for (const g of typedGroups) {
        if (g.advancing_teams && g.advancing_teams.length > 0) {
          // Reconstruct ranking: advancing teams first, rest after
          const advancing = g.advancing_teams as string[]
          const rest = (g.teams as string[]).filter((t) => !advancing.includes(t))
          rankMap.set(g.id, [...advancing, ...rest])
        } else {
          rankMap.set(g.id, [...(g.teams as string[])])
        }
      }
      setGroupRankings(rankMap)

      // Restore third-place assignments from matchup data
      const additionalCount = typedPool.additional_advancing ?? 0
      if (additionalCount > 0) {
        const assignments: string[] = new Array(additionalCount).fill('')
        const typedMatchups = (matchupsRes.data ?? []) as KnockoutMatchup[]
        for (const m of typedMatchups) {
          for (const [source, teamField] of [
            [m.group_source_a, m.team_a],
            [m.group_source_b, m.team_b],
          ] as [string | null, string | null][]) {
            const match = source?.match(/^3rd-(\d+)$/)
            if (match && teamField && !teamField.startsWith('3rd-')) {
              const idx = parseInt(match[1], 10) - 1
              if (idx >= 0 && idx < additionalCount) {
                assignments[idx] = teamField
              }
            }
          }
        }
        setThirdPlaceAssignments(assignments.filter((t) => t !== ''))
      }

      const questions = (bqRes.data ?? []) as BonusQuestion[]
      setBonusQuestions(questions)
      await loadBonusData(id!, questions)

      setLoading(false)
    }

    load()
  }, [id, session?.user, navigate, loadBonusData])

  // ─── Pool status ──────────────────────────────────────────────────────────

  const updatePoolStatus = async (newStatus: PoolStatus) => {
    if (!pool) return
    try {
      const { error } = await supabase
        .from('pools')
        .update({ status: newStatus })
        .eq('id', pool.id)
      if (error) throw error
      setPool({ ...pool, status: newStatus })
      toast.success(`Pool status changed to ${newStatus.replace('_', ' ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  // ─── Group results ────────────────────────────────────────────────────────

  const saveGroupResults = async () => {
    if (!pool || !session?.user) return
    try {
      setSaving(true)
      const advanceCount = pool.advance_per_group ?? 1

      for (const group of groups) {
        const ranking = groupRankings.get(group.id) ?? (group.teams as string[])
        const advancing = ranking.slice(0, advanceCount)
        const { error } = await supabase
          .from('groups')
          .update({ advancing_teams: advancing })
          .eq('id', group.id)
        if (error) throw error
      }

      // Auto-populate knockout matchups from group results + third-place assignments
      if (matchups.some((m) => m.group_source_a || m.group_source_b)) {
        const updated = await populateKnockoutFromGroups(
          matchups,
          groups,
          groupRankings,
          advanceCount,
          thirdPlaceAssignments,
        )
        setMatchups(updated)
      }

      toast.success('Group results saved! Knockout bracket updated.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save group results')
    } finally {
      setSaving(false)
    }
  }

  // ─── Knockout results ─────────────────────────────────────────────────────

  function handleResultPick(round: number, matchupIndex: number, team: string) {
    const newPick: PickChoice = {
      id: `result-${round}-${matchupIndex}`,
      pool_id: pool!.id,
      user_id: session!.user.id,
      round,
      matchup_index: matchupIndex,
      picked_team: team,
      submitted_at: null,
    }

    const updated = [
      ...resultPicks.filter((p) => !(p.round === round && p.matchup_index === matchupIndex)),
      newPick,
    ]

    setResultPicks(clearDownstreamPicks(updated, round, matchupIndex, totalRounds))
  }

  const saveKnockoutResults = async () => {
    if (!pool || !session?.user) return
    try {
      setSaving(true)
      for (const pick of resultPicks) {
        const { error } = await supabase.from('results').upsert(
          {
            pool_id: pool.id,
            round: pick.round,
            matchup_index: pick.matchup_index,
            winning_team: pick.picked_team,
            entered_by: session.user.id,
            entered_at: new Date().toISOString(),
          },
          { onConflict: 'pool_id,round,matchup_index' },
        )
        if (error) throw error
      }

      // Update local results state
      const newResults: Result[] = resultPicks.map((p) => ({
        id: p.id,
        pool_id: pool.id,
        round: p.round,
        matchup_index: p.matchup_index,
        winning_team: p.picked_team,
        entered_by: session.user.id,
        entered_at: new Date().toISOString(),
      }))
      setResults(newResults)

      toast.success('Knockout results saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save knockout results')
    } finally {
      setSaving(false)
    }
  }

  // ─── Bonus questions CRUD ─────────────────────────────────────────────────

  const addBonusQuestion = async () => {
    if (!pool || !newQuestionText.trim()) return
    const points = parseInt(newQuestionPoints, 10)
    if (isNaN(points) || points < 1) {
      toast.error('Points must be at least 1')
      return
    }

    try {
      const { data, error } = await supabase
        .from('bonus_questions')
        .insert({
          pool_id: pool.id,
          question_text: newQuestionText.trim(),
          points,
        })
        .select()
        .single()
      if (error) throw error
      setBonusQuestions((prev) => [...prev, data as BonusQuestion])
      setNewQuestionText('')
      setNewQuestionPoints('1')
      toast.success('Bonus question added!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add question')
    }
  }

  const deleteBonusQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase.from('bonus_questions').delete().eq('id', questionId)
      if (error) throw error
      setBonusQuestions((prev) => prev.filter((q) => q.id !== questionId))
      setShowDeleteDialog(null)
      toast.success('Bonus question deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete question')
    }
  }

  const saveCorrectAnswer = async (questionId: string, answer: string) => {
    try {
      const { error } = await supabase
        .from('bonus_questions')
        .update({ correct_answer: answer || null })
        .eq('id', questionId)
      if (error) throw error
      setCorrectAnswers((prev) => {
        const next = new Map(prev)
        if (answer) next.set(questionId, answer)
        else next.delete(questionId)
        return next
      })
      toast.success('Correct answer saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save answer')
    }
  }

  const toggleBonusScore = async (questionId: string, userId: string, points: number) => {
    if (!session?.user) return
    const currentScores = bonusScores.get(questionId) ?? new Map<string, number>()
    const current = currentScores.get(userId)
    const newPoints = current === points ? 0 : points

    try {
      const { error } = await supabase.from('bonus_scores').upsert(
        {
          bonus_question_id: questionId,
          user_id: userId,
          points_awarded: newPoints,
          manually_set: true,
          set_by: session.user.id,
          set_at: new Date().toISOString(),
        },
        { onConflict: 'bonus_question_id,user_id' },
      )
      if (error) throw error

      setBonusScores((prev) => {
        const next = new Map(prev)
        const inner = new Map(next.get(questionId) ?? new Map<string, number>())
        inner.set(userId, newPoints)
        next.set(questionId, inner)
        return next
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update score')
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  const isUpcoming = pool.status === 'upcoming'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${pool.id}`)}>
            &larr; Pool
          </Button>
          <h1 className="text-lg font-bold">Manage Results</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {/* ── Pool Status ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pool Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Select
              value={pool.status}
              onValueChange={(v) => updatePoolStatus(v as PoolStatus)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              "Locked" prevents new picks. "In Progress" means the tournament has started.
            </p>
          </CardContent>
        </Card>

        {/* ── Group Stage Results ──────────────────────────────────────────── */}
        {pool.has_group_stage && groups.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Group Stage Results</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Drag teams to their actual finishing position. Top {pool.advance_per_group ?? 1}{' '}
              advance per group.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((group) => (
                <GroupRankingTable
                  key={group.id}
                  group={group}
                  advanceCount={pool.advance_per_group ?? 1}
                  ranking={groupRankings.get(group.id) ?? (group.teams as string[])}
                  onRankingChange={(r) =>
                    setGroupRankings((prev) => new Map(prev).set(group.id, r))
                  }
                />
              ))}
            </div>
            <Button className="mt-4" onClick={saveGroupResults} disabled={saving}>
              {saving ? 'Saving...' : 'Save Group Results'}
            </Button>
          </section>
        )}

        {/* ── Best Third-Place Results ─────────────────────────────────────── */}
        {pool.has_group_stage && (pool.additional_advancing ?? 0) > 0 && groups.length > 0 && (() => {
          const advanceCount = pool.advance_per_group ?? 1
          const additionalCount = pool.additional_advancing ?? 0
          // Derive actual third-place teams from creator's group rankings
          const thirdPlaceTeams = groups.map((group) => {
            const ranking = groupRankings.get(group.id) ?? (group.teams as string[])
            return ranking[advanceCount] ?? null
          }).filter((t): t is string => t !== null)

          const toggleThirdPlace = (team: string) => {
            setThirdPlaceAssignments((prev) => {
              if (prev.includes(team)) return prev.filter((t) => t !== team)
              if (prev.length >= additionalCount) return prev
              return [...prev, team]
            })
          }

          const moveThirdPlace = (from: number, to: number) => {
            setThirdPlaceAssignments((prev) => {
              const next = [...prev]
              const [moved] = next.splice(from, 1)
              next.splice(to, 0, moved)
              return next
            })
          }

          return (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Best Third-Place Results</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Select which {additionalCount} third-place teams actually advanced.
                Order determines bracket slot assignment (3rd-1, 3rd-2, etc.).
                Save group results after making your selections to update the bracket.
              </p>

              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select teams ({thirdPlaceAssignments.length}/{additionalCount})
                </p>
                <div className="flex flex-wrap gap-2">
                  {thirdPlaceTeams.map((team) => {
                    const selected = thirdPlaceAssignments.includes(team)
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => toggleThirdPlace(team)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        }`}
                      >
                        {team}
                      </button>
                    )
                  })}
                </div>
              </div>

              {thirdPlaceAssignments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bracket slot assignments
                  </p>
                  <div className="rounded-md border divide-y">
                    {thirdPlaceAssignments.map((team, i) => (
                      <div key={team} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            3rd-{i + 1}
                          </Badge>
                          <span className="text-sm">{team}</span>
                        </div>
                        {thirdPlaceAssignments.length > 1 && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() => moveThirdPlace(i, i - 1)}
                              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={i === thirdPlaceAssignments.length - 1}
                              onClick={() => moveThirdPlace(i, i + 1)}
                              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })()}

        <Separator />

        {/* ── Knockout Results ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-1 text-lg font-semibold">Knockout Results</h2>
          {matchups.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                No bracket configured for this pool yet.
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Click the actual winner of each matchup. Results cascade through the bracket.
              </p>
              <BracketCanvas
                matchups={matchups}
                teamCount={teamCount}
                mode="pick"
                picks={resultPicks}
                results={[]}
                onPick={handleResultPick}
              />
              <Button className="mt-4" onClick={saveKnockoutResults} disabled={saving}>
                {saving ? 'Saving...' : 'Save Knockout Results'}
              </Button>
            </>
          )}
        </section>

        <Separator />

        {/* ── Bonus Questions ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Bonus Questions</h2>

          {/* Add new question (only when upcoming) */}
          {isUpcoming && (
            <Card className="mb-4">
              <CardContent className="space-y-3 pt-4">
                <Input
                  placeholder="Question text..."
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Points:</span>
                    <Input
                      type="number"
                      min={1}
                      className="w-20"
                      value={newQuestionPoints}
                      onChange={(e) => setNewQuestionPoints(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={addBonusQuestion} disabled={!newQuestionText.trim()}>
                    Add Question
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* List questions */}
          {bonusQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bonus questions yet.</p>
          ) : (
            <div className="space-y-4">
              {bonusQuestions.map((q) => {
                const answers = bonusAnswers.get(q.id) ?? []
                const scores = bonusScores.get(q.id) ?? new Map<string, number>()

                return (
                  <Card key={q.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">{q.question_text}</CardTitle>
                          <Badge variant="secondary">{q.points} pt{q.points !== 1 ? 's' : ''}</Badge>
                        </div>
                        {isUpcoming && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDeleteDialog(q.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Correct answer input (after lock) */}
                      {!isUpcoming && (
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-xs text-muted-foreground">Correct answer:</span>
                          <Input
                            className="h-8 text-sm"
                            placeholder="Enter correct answer..."
                            value={correctAnswers.get(q.id) ?? ''}
                            onChange={(e) =>
                              setCorrectAnswers((prev) => new Map(prev).set(q.id, e.target.value))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => saveCorrectAnswer(q.id, correctAnswers.get(q.id) ?? '')}
                          >
                            Save
                          </Button>
                        </div>
                      )}

                      {/* Member answers (after lock) */}
                      {!isUpcoming && answers.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Member Answers
                          </p>
                          <ul className="divide-y rounded-md border">
                            {answers.map((a) => {
                              const awarded = scores.get(a.user_id) ?? 0
                              return (
                                <li key={a.id} className="flex items-center justify-between px-3 py-2">
                                  <div className="flex-1">
                                    <span className="text-sm font-medium">{a.display_name ?? 'Unknown'}</span>
                                    <span className="ml-2 text-sm text-muted-foreground">{a.answer_text}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => toggleBonusScore(q.id, a.user_id, q.points)}
                                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                                      awarded > 0
                                        ? 'border-destructive bg-destructive text-destructive-foreground hover:opacity-80'
                                        : 'border-input hover:bg-muted'
                                    }`}
                                  >
                                    {awarded > 0 ? `Revoke (${awarded} pts)` : 'Award'}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* Delete question confirmation */}
      <Dialog open={showDeleteDialog !== null} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bonus question?</DialogTitle>
            <DialogDescription>
              This will permanently delete this question and any answers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && deleteBonusQuestion(showDeleteDialog)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
