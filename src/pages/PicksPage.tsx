import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { getRoundCount, clearDownstreamPicks } from '@/lib/bracket'
import BracketCanvas from '@/components/BracketCanvas'
import GroupRankingTable from '@/components/GroupRankingTable'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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

interface OtherMember {
  user_id: string
  display_name: string
  knockout_picks: PickChoice[]
  group_picks: GroupPick[]
  third_place_selections: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a group source label like "A1", "B2", or "3rd-1" to the actual team name
 * predicted by the user in their group rankings (or third-place selections).
 * Falls back to the raw label if no ranking exists yet.
 */
function resolveGroupSource(
  source: string | null,
  groups: GroupType[],
  groupRankings: Map<string, string[]>,
  thirdPlaceSelections: string[] = [],
): string | null {
  if (!source) return null

  // Handle "3rd-N" labels
  const thirdMatch = source.match(/^3rd-(\d+)$/)
  if (thirdMatch) {
    const idx = parseInt(thirdMatch[1], 10) - 1
    return thirdPlaceSelections[idx] ?? source
  }

  // Format: "A1" — first char is group prefix, remainder is 1-based position
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

/**
 * Return a copy of matchups with group_source labels replaced by the actual
 * team names from the user's current group rankings, so the bracket shows
 * real team names instead of "A1", "B2", etc.
 *
 * Note: the pool creation step stores the group source label in BOTH team_a
 * and group_source_a, so team_a is often "A1" rather than null. We resolve
 * using group_source_a/b when present, overriding team_a/b.
 */
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

/**
 * Build a group-source-label → team-name lookup from groups and rankings.
 * E.g. { "A1": "canada", "A2": "england", "B1": "usa", "B2": "turkey" }
 */
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

/**
 * Replace group-source labels in picks' picked_team values with actual team names.
 * Handles picks stored before the resolve fix (e.g. picked_team: "A1" → "canada").
 */
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

/**
 * Build a groupRankings Map from a member's group picks.
 */
function buildRankingsFromGroupPicks(
  groups: GroupType[],
  groupPicks: GroupPick[],
): Map<string, string[]> {
  const rankMap = new Map<string, string[]>()
  for (const group of groups) {
    const gp = groupPicks.find((p) => p.group_id === group.id)
    rankMap.set(group.id, initRanking(group, gp))
  }
  return rankMap
}

function initRanking(group: GroupType, savedPick?: GroupPick): string[] {
  const all = group.teams as string[]
  if (!savedPick) return [...all]

  const saved = savedPick.advancing_teams as string[]
  // If saved has all team — it's a full ranking, use it directly
  if (saved.length === all.length) return saved

  // Otherwise: put saved teams first, then remaining in original order
  const rest = all.filter((t) => !saved.includes(t))
  return [...saved, ...rest]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PicksPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  // ── Data
  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [isMember, setIsMember] = useState(true) // assume true; set false if not in pool_members

  // ── User's picks
  const [picks, setPicks] = useState<PickChoice[]>([])
  const [groupRankings, setGroupRankings] = useState<Map<string, string[]>>(new Map())
  const [thirdPlaceSelections, setThirdPlaceSelections] = useState<string[]>([])
  const [bonusAnswers, setBonusAnswers] = useState<Map<string, string>>(new Map())
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // ── Others' picks (visible after submission)
  const [otherMembers, setOtherMembers] = useState<OtherMember[]>([])
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  // ── UI state
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)

  // ─── Load others' picks ────────────────────────────────────────────────────

  const loadOthers = useCallback(
    async (poolId: string, currentUserId: string) => {
      const [membersRes, allPicksRes, allGroupPicksRes, allThirdPlaceRes] = await Promise.all([
        supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', poolId),
        supabase.from('picks').select('*').eq('pool_id', poolId).not('submitted_at', 'is', null),
        supabase
          .from('group_picks')
          .select('*')
          .eq('pool_id', poolId)
          .not('submitted_at', 'is', null),
        supabase.from('third_place_picks').select('*').eq('pool_id', poolId),
      ])

      const thirdPlaceData = (allThirdPlaceRes.data ?? []) as Array<{ user_id: string; selected_teams: string[] }>

      const others: OtherMember[] = []
      for (const member of membersRes.data ?? []) {
        if (member.user_id === currentUserId) continue
        const user = member.users as unknown as { display_name: string } | null
        const kPicks = ((allPicksRes.data ?? []) as PickChoice[]).filter(
          (p) => p.user_id === member.user_id,
        )
        const gPicks = ((allGroupPicksRes.data ?? []) as GroupPick[]).filter(
          (p) => p.user_id === member.user_id,
        )
        const tpPick = thirdPlaceData.find((tp) => tp.user_id === member.user_id)
        if (kPicks.length > 0 || gPicks.length > 0) {
          others.push({
            user_id: member.user_id,
            display_name: user?.display_name ?? 'Unknown',
            knockout_picks: kPicks,
            group_picks: gPicks,
            third_place_selections: (tpPick?.selected_teams ?? []) as string[],
          })
        }
      }
      setOtherMembers(others)
    },
    [],
  )

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !session?.user) return

    async function load() {
      const userId = session!.user.id

      const [poolRes, groupsRes, matchupsRes, resultsRes, userPicksRes, userGroupPicksRes] =
        await Promise.all([
          supabase.from('pools').select('*').eq('id', id!).single(),
          supabase.from('groups').select('*').eq('pool_id', id!).order('name'),
          supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
          supabase.from('results').select('*').eq('pool_id', id!),
          supabase.from('picks').select('*').eq('pool_id', id!).eq('user_id', userId),
          supabase.from('group_picks').select('*').eq('pool_id', id!).eq('user_id', userId),
        ])

      if (!poolRes.data) {
        toast.error('Pool not found')
        navigate('/dashboard')
        return
      }

      const typedPool = poolRes.data as Pool
      const typedGroups = (groupsRes.data ?? []) as GroupType[]
      setPool(typedPool)

      // Verify the current user is actually a pool member
      const { data: memberRow } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('pool_id', id!)
        .eq('user_id', userId)
        .maybeSingle()

      if (!memberRow) {
        setIsMember(false)
        setLoading(false)
        return
      }

      setGroups(typedGroups)
      setMatchups((matchupsRes.data ?? []) as KnockoutMatchup[])
      setResults((resultsRes.data ?? []) as Result[])

      // Load bonus questions
      const bqRes = await supabase
        .from('bonus_questions')
        .select('*')
        .eq('pool_id', id!)
        .order('created_at')
      const questions = (bqRes.data ?? []) as BonusQuestion[]
      setBonusQuestions(questions)

      // Load bonus answers for this user
      if (questions.length > 0) {
        const baRes = await supabase
          .from('bonus_answers')
          .select('*')
          .in(
            'bonus_question_id',
            questions.map((q) => q.id),
          )
          .eq('user_id', userId)
        const answerMap = new Map<string, string>()
        for (const a of baRes.data ?? []) {
          answerMap.set(a.bonus_question_id as string, a.answer_text as string)
        }
        setBonusAnswers(answerMap)
      }

      // Restore knockout picks
      const savedPicks = (userPicksRes.data ?? []) as PickChoice[]
      setPicks(savedPicks)

      // Determine submitted state
      let submitted = savedPicks.length > 0 && savedPicks.every((p) => p.submitted_at !== null)
      const savedGroupPicks = (userGroupPicksRes.data ?? []) as GroupPick[]
      if (typedPool.has_group_stage && savedGroupPicks.length > 0) {
        submitted = submitted && savedGroupPicks.every((p) => p.submitted_at !== null)
      }
      setHasSubmitted(submitted)

      // Restore group rankings
      const rankMap = new Map<string, string[]>()
      for (const group of typedGroups) {
        const saved = savedGroupPicks.find((gp) => gp.group_id === group.id)
        rankMap.set(group.id, initRanking(group, saved))
      }
      setGroupRankings(rankMap)

      // Restore third-place selections
      if ((typedPool.additional_advancing ?? 0) > 0) {
        const tpRes = await supabase
          .from('third_place_picks')
          .select('selected_teams')
          .eq('pool_id', id!)
          .eq('user_id', userId)
          .maybeSingle()
        if (tpRes.data?.selected_teams) {
          setThirdPlaceSelections(tpRes.data.selected_teams as string[])
        }
      }

      if (submitted) {
        await loadOthers(id!, userId)
      }

      setLoading(false)
    }

    load().catch((err) => {
      console.error('[PicksPage] load error:', err)
      toast.error('Failed to load picks page')
      setLoading(false)
    })
  }, [id, session?.user, navigate, loadOthers])

  // ─── Pick handlers ─────────────────────────────────────────────────────────

  const isReadOnly = hasSubmitted || pool?.status !== 'upcoming'

  const teamCount =
    pool?.has_group_stage && pool.advance_per_group
      ? groups.length * pool.advance_per_group + (pool.additional_advancing ?? 0)
      : (pool?.teams as string[] | undefined)?.length ?? 0

  const totalRounds = getRoundCount(teamCount)

  function handleKnockoutPick(round: number, matchupIndex: number, team: string) {
    if (isReadOnly) return

    const newPick: PickChoice = {
      id: `local-${round}-${matchupIndex}`,
      pool_id: pool!.id,
      user_id: session!.user.id,
      round,
      matchup_index: matchupIndex,
      picked_team: team,
      submitted_at: null,
    }

    const updated = [
      ...picks.filter((p) => !(p.round === round && p.matchup_index === matchupIndex)),
      newPick,
    ]

    setPicks(clearDownstreamPicks(updated, round, matchupIndex, totalRounds))
  }

  function handleGroupRankingChange(groupId: string, newRanking: string[]) {
    if (isReadOnly) return
    setGroupRankings((prev) => new Map(prev).set(groupId, newRanking))
  }

  // ─── Save / Submit ─────────────────────────────────────────────────────────

  async function persistPicks(submittedAt: string | null) {
    if (!pool || !session?.user) return
    const userId = session.user.id

    // Validate group picks
    if (pool.has_group_stage) {
      for (const group of groups) {
        const ranking = groupRankings.get(group.id) ?? []
        if (ranking.length === 0) {
          toast.error(`Please rank teams for ${group.name}`)
          return false
        }
      }
    }

    // Validate third-place selections
    const additionalCount = pool.additional_advancing ?? 0
    if (pool.has_group_stage && additionalCount > 0) {
      if (thirdPlaceSelections.length !== additionalCount) {
        toast.error(`Please select ${additionalCount} advancing third-place teams`)
        return false
      }
    }

    // Validate knockout picks: final must be picked
    if (totalRounds > 0) {
      const hasFinal = picks.some((p) => p.round === totalRounds && p.matchup_index === 0)
      if (!hasFinal) {
        toast.error('Please pick a champion (fill in the complete bracket)')
        return false
      }
    }

    // Upsert group picks
    if (pool.has_group_stage) {
      for (const group of groups) {
        const ranking = groupRankings.get(group.id) ?? (group.teams as string[])
        const { error } = await supabase.from('group_picks').upsert(
          {
            pool_id: pool.id,
            user_id: userId,
            group_id: group.id,
            advancing_teams: ranking,
            submitted_at: submittedAt,
          },
          { onConflict: 'pool_id,user_id,group_id' },
        )
        if (error) throw error
      }
    }

    // Upsert third-place selections
    if (pool.has_group_stage && (pool.additional_advancing ?? 0) > 0 && thirdPlaceSelections.length > 0) {
      const { error } = await supabase.from('third_place_picks').upsert(
        {
          pool_id: pool.id,
          user_id: userId,
          selected_teams: thirdPlaceSelections,
          submitted_at: submittedAt,
        },
        { onConflict: 'pool_id,user_id' },
      )
      if (error) throw error
    }

    // Upsert knockout picks (all rounds)
    for (const pick of picks) {
      const { error } = await supabase.from('picks').upsert(
        {
          pool_id: pool.id,
          user_id: userId,
          round: pick.round,
          matchup_index: pick.matchup_index,
          picked_team: pick.picked_team,
          submitted_at: submittedAt,
        },
        { onConflict: 'pool_id,user_id,round,matchup_index' },
      )
      if (error) throw error
    }

    // Upsert bonus answers
    for (const [questionId, answerText] of bonusAnswers.entries()) {
      if (!answerText.trim()) continue
      const { error } = await supabase.from('bonus_answers').upsert(
        {
          bonus_question_id: questionId,
          user_id: userId,
          answer_text: answerText.trim(),
          submitted_at: submittedAt,
        },
        { onConflict: 'bonus_question_id,user_id' },
      )
      if (error) throw error
    }

    return true
  }

  async function handleSave() {
    if (isReadOnly) return
    try {
      setIsSaving(true)
      const ok = await persistPicks(null)
      if (ok) toast.success('Progress saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save picks')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit() {
    setShowSubmitDialog(false)
    try {
      setIsSubmitting(true)
      const now = new Date().toISOString()
      const ok = await persistPicks(now)
      if (ok) {
        toast.success('Picks submitted!')
        setHasSubmitted(true)
        await loadOthers(pool!.id, session!.user.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit picks')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <Skeleton className="h-6 w-40" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  if (!isMember) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              &larr; Home
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="mb-2 text-xl font-semibold">You're not a member of this pool</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            You need to join via the invite link before you can enter picks.
          </p>
          <Button asChild variant="outline">
            <a href={`/join/${pool.invite_code}`}>Join "{pool.name}"</a>
          </Button>
        </main>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${pool.id}`)}>
              &larr; Pool
            </Button>
            <h1 className="text-base font-bold">{pool.name} — Picks</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        {/* Status banners */}
        {hasSubmitted && (
          <div className="flex items-center gap-2">
            <Badge variant="default">Picks Submitted</Badge>
            <span className="text-sm text-muted-foreground">
              Your picks are locked in. See how others picked below.
            </span>
          </div>
        )}

        {!hasSubmitted && pool.status !== 'upcoming' && (
          <Card>
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              This pool is no longer accepting picks.
            </CardContent>
          </Card>
        )}

        {/* ── Group stage picks ────────────────────────────────────────────── */}
        {pool.has_group_stage && groups.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Group Stage Picks</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Drag to rank each group — top {pool.advance_per_group ?? 1}{' '}
              {pool.advance_per_group === 1 ? 'team advances' : 'teams advance'} per group.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((group) => (
                <GroupRankingTable
                  key={group.id}
                  group={group}
                  advanceCount={pool.advance_per_group ?? 1}
                  ranking={groupRankings.get(group.id) ?? (group.teams as string[])}
                  onRankingChange={(r) => handleGroupRankingChange(group.id, r)}
                  disabled={isReadOnly}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Third-place picker ─────────────────────────────────────────── */}
        {pool.has_group_stage && (pool.additional_advancing ?? 0) > 0 && groups.length > 0 && (() => {
          const advanceCount = pool.advance_per_group ?? 1
          const additionalCount = pool.additional_advancing ?? 0
          // Derive predicted third-place teams from user's group rankings
          const thirdPlaceTeams = groups.map((group) => {
            const ranking = groupRankings.get(group.id) ?? (group.teams as string[])
            return ranking[advanceCount] ?? null // position after last advancing spot
          }).filter((t): t is string => t !== null)

          const toggleThirdPlace = (team: string) => {
            if (isReadOnly) return
            setThirdPlaceSelections((prev) => {
              if (prev.includes(team)) {
                return prev.filter((t) => t !== team)
              }
              if (prev.length >= additionalCount) return prev
              return [...prev, team]
            })
          }

          const moveThirdPlace = (from: number, to: number) => {
            if (isReadOnly) return
            setThirdPlaceSelections((prev) => {
              const next = [...prev]
              const [moved] = next.splice(from, 1)
              next.splice(to, 0, moved)
              return next
            })
          }

          return (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Best Third-Place Teams</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Select {additionalCount} third-place teams you predict will advance to the knockout stage.
                {thirdPlaceSelections.length > 0 && ' Drag to reorder — order determines bracket position (3rd-1, 3rd-2, etc.).'}
              </p>

              {/* Available third-place teams */}
              <div className="mb-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select teams ({thirdPlaceSelections.length}/{additionalCount})
                </p>
                <div className="flex flex-wrap gap-2">
                  {thirdPlaceTeams.map((team) => {
                    const selected = thirdPlaceSelections.includes(team)
                    return (
                      <button
                        key={team}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => toggleThirdPlace(team)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {team}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ordered assignments */}
              {thirdPlaceSelections.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Bracket slot assignments
                  </p>
                  <div className="rounded-md border divide-y">
                    {thirdPlaceSelections.map((team, i) => (
                      <div key={team} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            3rd-{i + 1}
                          </Badge>
                          <span className="text-sm">{team}</span>
                        </div>
                        {!isReadOnly && thirdPlaceSelections.length > 1 && (
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
                              disabled={i === thirdPlaceSelections.length - 1}
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

        {/* ── Knockout bracket ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-1 text-lg font-semibold">Knockout Bracket</h2>
          {matchups.length === 0 ? (
            <Card>
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                No bracket configured for this pool yet.
              </CardContent>
            </Card>
          ) : (
            <>
              {!isReadOnly && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Click a team to pick them as the winner — your picks cascade through to the final.
                </p>
              )}
              <BracketCanvas
                matchups={resolveMatchupTeams(matchups, groups, groupRankings, thirdPlaceSelections)}
                teamCount={teamCount}
                mode="pick"
                picks={resolvePicks(picks, buildGroupSourceMap(groups, groupRankings, thirdPlaceSelections))}
                results={results}
                onPick={handleKnockoutPick}
                disabled={isReadOnly}
              />
            </>
          )}
        </section>

        {/* ── Bonus questions ───────────────────────────────────────────────── */}
        {bonusQuestions.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold">Bonus Questions</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Answer for extra points. Each question is worth the indicated amount.
            </p>
            <div className="space-y-4">
              {bonusQuestions.map((q) => (
                <Card key={q.id}>
                  <CardContent className="py-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{q.question_text}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {q.points} pt{q.points !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <Input
                      placeholder="Your answer…"
                      value={bonusAnswers.get(q.id) ?? ''}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        const newMap = new Map(bonusAnswers)
                        newMap.set(q.id, e.target.value)
                        setBonusAnswers(newMap)
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        {!isReadOnly && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSave} disabled={isSaving || isSubmitting}>
              {isSaving ? 'Saving…' : 'Save Progress'}
            </Button>
            <Button
              onClick={() => setShowSubmitDialog(true)}
              disabled={isSaving || isSubmitting}
            >
              {isSubmitting ? 'Submitting…' : 'Submit Picks'}
            </Button>
          </div>
        )}

        {/* ── Others' picks (after submission) ─────────────────────────────── */}
        {hasSubmitted && (
          <>
            <Separator />
            <section>
              <h2 className="mb-4 text-lg font-semibold">Other Members' Picks</h2>

              {otherMembers.length === 0 ? (
                <Card>
                  <CardContent className="py-4 text-center text-sm text-muted-foreground">
                    No other members have submitted picks yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {otherMembers.map((member) => {
                    const isOpen = expandedMember === member.user_id
                    return (
                      <Card key={member.user_id}>
                        <CardHeader
                          className="cursor-pointer select-none py-3"
                          onClick={() =>
                            setExpandedMember(isOpen ? null : member.user_id)
                          }
                        >
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{member.display_name}</CardTitle>
                            <span className="text-xs text-muted-foreground">
                              {isOpen ? '▲ hide' : '▼ show'}
                            </span>
                          </div>
                        </CardHeader>

                        {isOpen && (
                          <CardContent className="space-y-6 pt-0">
                            {/* Their group rankings */}
                            {pool.has_group_stage &&
                              member.group_picks.length > 0 &&
                              groups.length > 0 && (
                                <div>
                                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Group Predictions
                                  </p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {groups.map((group) => {
                                      const gp = member.group_picks.find(
                                        (p) => p.group_id === group.id,
                                      )
                                      if (!gp) return null
                                      const ranking = gp.advancing_teams as string[]
                                      return (
                                        <GroupRankingTable
                                          key={group.id}
                                          group={group}
                                          advanceCount={pool.advance_per_group ?? 1}
                                          ranking={
                                            ranking.length === (group.teams as string[]).length
                                              ? ranking
                                              : initRanking(group, gp)
                                          }
                                          disabled
                                        />
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                            {/* Their bracket */}
                            {member.knockout_picks.length > 0 && matchups.length > 0 && (
                              (() => {
                                const memberRankings = buildRankingsFromGroupPicks(groups, member.group_picks)
                                const memberThirdPlace = member.third_place_selections
                                const memberSourceMap = buildGroupSourceMap(groups, memberRankings, memberThirdPlace)
                                return (
                                  <div>
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Bracket Picks
                                    </p>
                                    <BracketCanvas
                                      matchups={resolveMatchupTeams(matchups, groups, memberRankings, memberThirdPlace)}
                                      teamCount={teamCount}
                                      mode="view"
                                      picks={resolvePicks(member.knockout_picks, memberSourceMap)}
                                      results={results}
                                    />
                                  </div>
                                )
                              })()
                            )}
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── Submit confirmation dialog ─────────────────────────────────────── */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your picks?</DialogTitle>
            <DialogDescription>
              Once submitted, you can view other members' picks but you won't be able to change
              your own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
