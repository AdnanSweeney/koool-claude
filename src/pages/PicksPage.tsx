import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { Pool, Group as GroupType, KnockoutMatchup, Pick, GroupPick, Result } from '@/types'

interface OtherUserPicks {
  user_id: string
  display_name: string
  knockout_picks: Pick[]
  group_picks: GroupPick[]
}

export default function PicksPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [_results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // User's picks
  const [knockoutPicks, setKnockoutPicks] = useState<Map<string, string>>(new Map())
  const [groupPicks, setGroupPicks] = useState<Map<string, Set<string>>>(new Map())
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Others' picks (visible after submission)
  const [othersPicks, setOthersPicks] = useState<OtherUserPicks[]>([])

  useEffect(() => {
    if (!id || !session?.user) return

    async function load() {
      const [poolRes, groupsRes, matchupsRes, resultsRes, userPicksRes, userGroupPicksRes] =
        await Promise.all([
          supabase.from('pools').select('*').eq('id', id!).single(),
          supabase.from('groups').select('*').eq('pool_id', id!),
          supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
          supabase.from('results').select('*').eq('pool_id', id!),
          supabase.from('picks').select('*').eq('pool_id', id!).eq('user_id', session!.user.id),
          supabase.from('group_picks').select('*').eq('pool_id', id!).eq('user_id', session!.user.id),
        ])

      if (!poolRes.data) {
        toast.error('Pool not found')
        navigate('/dashboard')
        return
      }

      const typedPool = poolRes.data as Pool
      setPool(typedPool)
      setGroups((groupsRes.data ?? []) as GroupType[])
      setMatchups((matchupsRes.data ?? []) as KnockoutMatchup[])
      setResults((resultsRes.data ?? []) as Result[])

      // Load user's existing knockout picks
      const kp = new Map<string, string>()
      let allSubmitted = true
      for (const pick of (userPicksRes.data ?? []) as Pick[]) {
        kp.set(`${pick.round}-${pick.matchup_index}`, pick.picked_team)
        if (!pick.submitted_at) allSubmitted = false
      }
      if ((userPicksRes.data ?? []).length === 0) allSubmitted = false
      setKnockoutPicks(kp)

      // Load user's existing group picks
      const gp = new Map<string, Set<string>>()
      for (const pick of (userGroupPicksRes.data ?? []) as GroupPick[]) {
        gp.set(pick.group_id, new Set(pick.advancing_teams as string[]))
        if (!pick.submitted_at) allSubmitted = false
      }
      setGroupPicks(gp)
      setHasSubmitted(allSubmitted && (userPicksRes.data ?? []).length > 0)

      // If user has submitted, load others' picks
      if (allSubmitted && (userPicksRes.data ?? []).length > 0) {
        await loadOthersPicks(id!, session!.user.id)
      }

      setLoading(false)
    }

    load()
  }, [id, session?.user, navigate])

  const loadOthersPicks = async (poolId: string, currentUserId: string) => {
    const [membersRes, allPicksRes, allGroupPicksRes] = await Promise.all([
      supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', poolId),
      supabase.from('picks').select('*').eq('pool_id', poolId).not('submitted_at', 'is', null),
      supabase.from('group_picks').select('*').eq('pool_id', poolId).not('submitted_at', 'is', null),
    ])

    const others: OtherUserPicks[] = []
    for (const member of (membersRes.data ?? [])) {
      if (member.user_id === currentUserId) continue
      const user = member.users as unknown as { display_name: string } | null
      const userKPicks = ((allPicksRes.data ?? []) as Pick[]).filter(
        (p) => p.user_id === member.user_id,
      )
      const userGPicks = ((allGroupPicksRes.data ?? []) as GroupPick[]).filter(
        (p) => p.user_id === member.user_id,
      )
      if (userKPicks.length > 0 || userGPicks.length > 0) {
        others.push({
          user_id: member.user_id,
          display_name: user?.display_name ?? 'Unknown',
          knockout_picks: userKPicks,
          group_picks: userGPicks,
        })
      }
    }
    setOthersPicks(others)
  }

  const toggleGroupPick = (groupId: string, team: string) => {
    if (hasSubmitted || pool?.status !== 'upcoming') return
    const current = groupPicks.get(groupId) ?? new Set<string>()
    const maxPicks = pool?.advance_per_group ?? 1

    const updated = new Set(current)
    if (updated.has(team)) {
      updated.delete(team)
    } else if (updated.size < maxPicks) {
      updated.add(team)
    }

    const newMap = new Map(groupPicks)
    newMap.set(groupId, updated)
    setGroupPicks(newMap)
  }

  const setKnockoutPick = (round: number, matchupIndex: number, team: string) => {
    if (hasSubmitted || pool?.status !== 'upcoming') return
    const key = `${round}-${matchupIndex}`
    const newMap = new Map(knockoutPicks)
    newMap.set(key, team)
    setKnockoutPicks(newMap)
  }

  const handleSubmit = async () => {
    if (!pool || !session?.user) return
    try {
      setSubmitting(true)
      const now = new Date().toISOString()

      // Upsert group picks
      if (pool.has_group_stage) {
        for (const group of groups) {
          const selected = groupPicks.get(group.id)
          if (!selected || selected.size === 0) {
            toast.error(`Please select advancing teams for ${group.name}`)
            return
          }

          await supabase.from('group_picks').upsert(
            {
              pool_id: pool.id,
              user_id: session.user.id,
              group_id: group.id,
              advancing_teams: Array.from(selected),
              submitted_at: now,
            },
            { onConflict: 'pool_id,user_id,group_id' },
          )
        }
      }

      // Upsert knockout picks
      const r1Matchups = matchups.filter((m) => m.round === 1)
      for (const m of r1Matchups) {
        const picked = knockoutPicks.get(`${m.round}-${m.matchup_index}`)
        if (!picked) {
          toast.error(`Please pick a winner for matchup #${m.matchup_index + 1}`)
          return
        }

        await supabase.from('picks').upsert(
          {
            pool_id: pool.id,
            user_id: session.user.id,
            round: m.round,
            matchup_index: m.matchup_index,
            picked_team: picked,
            submitted_at: now,
          },
          { onConflict: 'pool_id,user_id,round,matchup_index' },
        )
      }

      toast.success('Picks submitted!')
      setHasSubmitted(true)
      await loadOthersPicks(pool.id, session.user.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit picks')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <Skeleton className="h-6 w-40" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  const isUpcoming = pool.status === 'upcoming'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${pool.id}`)}>
            &larr; Pool
          </Button>
          <h1 className="text-lg font-bold">{pool.name} — Picks</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {hasSubmitted && (
          <Badge variant="default" className="text-sm">Picks Submitted</Badge>
        )}

        {!isUpcoming && !hasSubmitted && (
          <Card>
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              This pool is no longer accepting picks.
            </CardContent>
          </Card>
        )}

        {/* Group Picks */}
        {pool.has_group_stage && groups.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Group Stage Picks
              {pool.advance_per_group && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (select top {pool.advance_per_group} per group)
                </span>
              )}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => {
                const selected = groupPicks.get(group.id) ?? new Set<string>()
                return (
                  <div key={group.id} className="rounded-md border">
                    <div className="border-b bg-muted/50 px-3 py-2">
                      <h4 className="text-sm font-semibold">{group.name}</h4>
                    </div>
                    <ul className="divide-y">
                      {(group.teams as string[]).map((team) => (
                        <li key={team} className="flex items-center justify-between px-3 py-2">
                          <span className="text-sm">{team}</span>
                          <button
                            type="button"
                            disabled={hasSubmitted || !isUpcoming}
                            onClick={() => toggleGroupPick(group.id, team)}
                            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                              selected.has(team)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input hover:bg-muted'
                            } disabled:opacity-50`}
                          >
                            {selected.has(team) ? 'Selected' : 'Pick'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Knockout Picks */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Knockout Picks</h2>
          <div className="space-y-3">
            {matchups
              .filter((m) => m.round === 1)
              .sort((a, b) => a.matchup_index - b.matchup_index)
              .map((m) => {
                const teamA = m.team_a ?? m.group_source_a ?? 'TBD'
                const teamB = m.team_b ?? m.group_source_b ?? 'TBD'
                const picked = knockoutPicks.get(`${m.round}-${m.matchup_index}`)

                return (
                  <div key={m.id} className="rounded-md border p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Matchup #{m.matchup_index + 1}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={hasSubmitted || !isUpcoming}
                        onClick={() => setKnockoutPick(m.round, m.matchup_index, teamA)}
                        className={`flex-1 rounded-md border p-2 text-sm transition-colors ${
                          picked === teamA
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        } disabled:opacity-50`}
                      >
                        {teamA}
                      </button>
                      <span className="flex items-center text-xs text-muted-foreground">vs</span>
                      <button
                        type="button"
                        disabled={hasSubmitted || !isUpcoming}
                        onClick={() => setKnockoutPick(m.round, m.matchup_index, teamB)}
                        className={`flex-1 rounded-md border p-2 text-sm transition-colors ${
                          picked === teamB
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        } disabled:opacity-50`}
                      >
                        {teamB}
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        </section>

        {/* Submit */}
        {isUpcoming && !hasSubmitted && (
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit All Picks'}
          </Button>
        )}

        {/* Others' picks (visible after submission) */}
        {hasSubmitted && othersPicks.length > 0 && (
          <>
            <Separator />
            <section>
              <h2 className="mb-3 text-lg font-semibold">Other Members' Picks</h2>
              <div className="space-y-4">
                {othersPicks.map((other) => (
                  <Card key={other.user_id}>
                    <CardHeader>
                      <CardTitle className="text-base">{other.display_name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Their group picks */}
                      {other.group_picks.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            Group Picks
                          </p>
                          {other.group_picks.map((gp) => {
                            const group = groups.find((g) => g.id === gp.group_id)
                            return (
                              <p key={gp.group_id} className="text-sm">
                                {group?.name}: {(gp.advancing_teams as string[]).join(', ')}
                              </p>
                            )
                          })}
                        </div>
                      )}
                      {/* Their knockout picks */}
                      {other.knockout_picks.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold text-muted-foreground">
                            Knockout Picks
                          </p>
                          {other.knockout_picks
                            .sort((a, b) =>
                              a.round !== b.round
                                ? a.round - b.round
                                : a.matchup_index - b.matchup_index,
                            )
                            .map((p) => (
                              <p key={`${p.round}-${p.matchup_index}`} className="text-sm">
                                R{p.round} #{p.matchup_index + 1}: {p.picked_team}
                              </p>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}

        {hasSubmitted && othersPicks.length === 0 && (
          <Card>
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              No other members have submitted picks yet.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
