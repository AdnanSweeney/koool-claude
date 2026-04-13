import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { computeGroupScore, computeKnockoutScore, computeBonusScore, computeTotalScore } from '@/lib/scoring'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type {
  Pool,
  Group as GroupType,
  Result,
  Pick as PickChoice,
  GroupPick,
  BonusScore,
} from '@/types'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  group_pts: number
  bracket_pts: number
  bonus_pts: number
  total: number
  status: 'submitted' | 'in_progress' | 'not_started'
}

interface LeaderboardProps {
  pool: Pool
  groups: GroupType[]
}

export default function Leaderboard({ pool, groups }: LeaderboardProps) {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const isLocked = pool.status !== 'upcoming'

  const loadLeaderboard = useCallback(async () => {
    const poolId = pool.id

    const [membersRes, picksRes, groupPicksRes, resultsRes, bonusScoresRes] = await Promise.all([
      supabase.from('pool_members').select('user_id, users(display_name)').eq('pool_id', poolId),
      supabase.from('picks').select('*').eq('pool_id', poolId),
      supabase.from('group_picks').select('*').eq('pool_id', poolId),
      supabase.from('results').select('*').eq('pool_id', poolId),
      supabase.from('bonus_scores').select('*, bonus_questions!inner(pool_id)').eq('bonus_questions.pool_id', poolId),
    ])

    const members = membersRes.data ?? []
    const allPicks = (picksRes.data ?? []) as PickChoice[]
    const allGroupPicks = (groupPicksRes.data ?? []) as GroupPick[]
    const results = (resultsRes.data ?? []) as Result[]
    const allBonusScores = (bonusScoresRes.data ?? []) as BonusScore[]

    // Build actual advancing data for group scoring
    const actualAdvancing = groups
      .filter((g) => g.advancing_teams && g.advancing_teams.length > 0)
      .map((g) => ({
        group_id: g.id,
        advancing_teams: g.advancing_teams as string[],
      }))

    const leaderboard: LeaderboardEntry[] = members.map((m) => {
      const user = m.users as unknown as { display_name: string } | null
      const userId = m.user_id

      // User's picks
      const userPicks = allPicks.filter((p) => p.user_id === userId)
      const userGroupPicks = allGroupPicks.filter((p) => p.user_id === userId)
      const userBonusScores = allBonusScores.filter((s) => s.user_id === userId)

      // Determine status
      const submittedPicks = userPicks.filter((p) => p.submitted_at !== null)
      const submittedGroupPicks = userGroupPicks.filter((p) => p.submitted_at !== null)
      let status: LeaderboardEntry['status'] = 'not_started'
      if (submittedPicks.length > 0 || submittedGroupPicks.length > 0) {
        status = 'submitted'
      } else if (userPicks.length > 0 || userGroupPicks.length > 0) {
        status = 'in_progress'
      }

      // Compute scores
      const groupPickData = userGroupPicks.map((gp) => ({
        group_id: gp.group_id,
        advancing_teams: (gp.advancing_teams as string[]).slice(0, pool.advance_per_group ?? 1),
      }))
      const groupPts = computeGroupScore(groupPickData, actualAdvancing)
      const bracketPts = computeKnockoutScore(userPicks, results)
      const bonusPts = computeBonusScore(userBonusScores)
      const total = computeTotalScore(groupPts, bracketPts, bonusPts)

      return {
        user_id: userId,
        display_name: user?.display_name ?? 'Unknown',
        group_pts: groupPts,
        bracket_pts: bracketPts,
        bonus_pts: bonusPts,
        total,
        status,
      }
    })

    // Sort by total descending
    leaderboard.sort((a, b) => b.total - a.total)
    setEntries(leaderboard)
    setLoading(false)
  }, [pool, groups])

  useEffect(() => {
    loadLeaderboard()
  }, [loadLeaderboard])

  // Subscribe to results changes for live score updates
  useEffect(() => {
    const channel = supabase
      .channel(`results:${pool.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results', filter: `pool_id=eq.${pool.id}` },
        () => {
          loadLeaderboard()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_scores' },
        () => {
          loadLeaderboard()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pool.id, loadLeaderboard])

  const statusLabel = {
    submitted: 'Submitted',
    in_progress: 'In Progress',
    not_started: 'Not Started',
  } as const

  const statusVariant = {
    submitted: 'default',
    in_progress: 'secondary',
    not_started: 'outline',
  } as const

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No members yet.</p>
        </CardContent>
      </Card>
    )
  }

  const handleRowClick = (userId: string) => {
    if (isLocked) {
      navigate(`/pools/${pool.id}/bracket/${userId}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Name</th>
                {pool.has_group_stage && <th className="px-4 py-2 font-medium text-right">Group</th>}
                <th className="px-4 py-2 font-medium text-right">Bracket</th>
                <th className="px-4 py-2 font-medium text-right">Bonus</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry, i) => {
                const isCurrentUser = entry.user_id === session?.user?.id
                return (
                  <tr
                    key={entry.user_id}
                    onClick={() => handleRowClick(entry.user_id)}
                    className={cn(
                      'transition-colors',
                      isLocked && 'cursor-pointer hover:bg-muted/50',
                      isCurrentUser && 'bg-primary/5',
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(isCurrentUser && 'font-semibold')}>
                        {entry.display_name}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                        )}
                      </span>
                    </td>
                    {pool.has_group_stage && (
                      <td className="px-4 py-2.5 text-right tabular-nums">{entry.group_pts}</td>
                    )}
                    <td className="px-4 py-2.5 text-right tabular-nums">{entry.bracket_pts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{entry.bonus_pts}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{entry.total}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge variant={statusVariant[entry.status]}>
                        {statusLabel[entry.status]}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
