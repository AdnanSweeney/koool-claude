import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
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
import type { Pool, PoolStatus, Group as GroupType, KnockoutMatchup, Result } from '@/types'

export default function ManageResultsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [pool, setPool] = useState<Pool | null>(null)
  const [groups, setGroups] = useState<GroupType[]>([])
  const [matchups, setMatchups] = useState<KnockoutMatchup[]>([])
  const [_results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)

  // Group advancing selections
  const [groupAdvancing, setGroupAdvancing] = useState<Map<string, Set<string>>>(new Map())
  // Knockout result selections
  const [knockoutResults, setKnockoutResults] = useState<Map<string, string>>(new Map())

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id || !session?.user) return

    async function load() {
      const [poolRes, groupsRes, matchupsRes, resultsRes] = await Promise.all([
        supabase.from('pools').select('*').eq('id', id!).single(),
        supabase.from('groups').select('*').eq('pool_id', id!),
        supabase.from('knockout_matchups').select('*').eq('pool_id', id!),
        supabase.from('results').select('*').eq('pool_id', id!),
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
      setResults((resultsRes.data ?? []) as Result[])

      // Initialize group advancing from existing data
      const ga = new Map<string, Set<string>>()
      for (const g of typedGroups) {
        if (g.advancing_teams) {
          ga.set(g.id, new Set(g.advancing_teams as string[]))
        }
      }
      setGroupAdvancing(ga)

      // Initialize knockout results from existing data
      const kr = new Map<string, string>()
      for (const r of (resultsRes.data ?? []) as Result[]) {
        kr.set(`${r.round}-${r.matchup_index}`, r.winning_team)
      }
      setKnockoutResults(kr)

      setLoading(false)
    }

    load()
  }, [id, session?.user, navigate])

  const toggleGroupAdvancing = (groupId: string, team: string) => {
    const current = groupAdvancing.get(groupId) ?? new Set<string>()
    const maxAdvance = pool?.advance_per_group ?? 1

    const updated = new Set(current)
    if (updated.has(team)) {
      updated.delete(team)
    } else if (updated.size < maxAdvance) {
      updated.add(team)
    }

    const newMap = new Map(groupAdvancing)
    newMap.set(groupId, updated)
    setGroupAdvancing(newMap)
  }

  const setKnockoutResult = (round: number, matchupIndex: number, winner: string) => {
    const key = `${round}-${matchupIndex}`
    const newMap = new Map(knockoutResults)
    newMap.set(key, winner)
    setKnockoutResults(newMap)
  }

  const saveGroupResults = async () => {
    if (!pool || !session?.user) return
    try {
      setSaving(true)
      for (const group of groups) {
        const advancing = groupAdvancing.get(group.id)
        if (advancing && advancing.size > 0) {
          const { error } = await supabase
            .from('groups')
            .update({ advancing_teams: Array.from(advancing) })
            .eq('id', group.id)
          if (error) throw error
        }
      }
      toast.success('Group results saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save group results')
    } finally {
      setSaving(false)
    }
  }

  const saveKnockoutResults = async () => {
    if (!pool || !session?.user) return
    try {
      setSaving(true)
      for (const [key, winner] of knockoutResults) {
        const [round, matchupIndex] = key.split('-').map(Number)
        const { error } = await supabase.from('results').upsert(
          {
            pool_id: pool.id,
            round,
            matchup_index: matchupIndex,
            winning_team: winner,
            entered_by: session.user.id,
            entered_at: new Date().toISOString(),
          },
          { onConflict: 'pool_id,round,matchup_index' },
        )
        if (error) throw error
      }
      toast.success('Knockout results saved!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save knockout results')
    } finally {
      setSaving(false)
    }
  }

  const updatePoolStatus = async (newStatus: PoolStatus) => {
    if (!pool) return
    try {
      const { error } = await supabase
        .from('pools')
        .update({ status: newStatus })
        .eq('id', pool.id)
      if (error) throw error
      setPool({ ...pool, status: newStatus })
      toast.success(`Pool status changed to ${newStatus}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <Skeleton className="h-6 w-48" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  if (!pool) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${pool.id}`)}>
            &larr; Pool
          </Button>
          <h1 className="text-lg font-bold">Manage Results</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        {/* Pool Status */}
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

        {/* Group Results */}
        {pool.has_group_stage && groups.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Group Stage Results
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (select top {pool.advance_per_group} per group)
              </span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group) => {
                const selected = groupAdvancing.get(group.id) ?? new Set<string>()
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
                            onClick={() => toggleGroupAdvancing(group.id, team)}
                            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                              selected.has(team)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input hover:bg-muted'
                            }`}
                          >
                            {selected.has(team) ? 'Advances' : 'Mark'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
            <Button className="mt-3" onClick={saveGroupResults} disabled={saving}>
              {saving ? 'Saving...' : 'Save Group Results'}
            </Button>
          </section>
        )}

        <Separator />

        {/* Knockout Results */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Knockout Results</h2>
          <div className="space-y-3">
            {matchups
              .filter((m) => m.round === 1)
              .sort((a, b) => a.matchup_index - b.matchup_index)
              .map((m) => {
                const teamA = m.team_a ?? m.group_source_a ?? 'TBD'
                const teamB = m.team_b ?? m.group_source_b ?? 'TBD'
                const winner = knockoutResults.get(`${m.round}-${m.matchup_index}`)

                return (
                  <div key={m.id} className="rounded-md border p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Matchup #{m.matchup_index + 1}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setKnockoutResult(m.round, m.matchup_index, teamA)}
                        className={`flex-1 rounded-md border p-2 text-sm transition-colors ${
                          winner === teamA
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        }`}
                      >
                        {teamA}
                      </button>
                      <span className="flex items-center text-xs text-muted-foreground">vs</span>
                      <button
                        type="button"
                        onClick={() => setKnockoutResult(m.round, m.matchup_index, teamB)}
                        className={`flex-1 rounded-md border p-2 text-sm transition-colors ${
                          winner === teamB
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted'
                        }`}
                      >
                        {teamB}
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
          <Button className="mt-3" onClick={saveKnockoutResults} disabled={saving}>
            {saving ? 'Saving...' : 'Save Knockout Results'}
          </Button>
        </section>
      </main>
    </div>
  )
}
