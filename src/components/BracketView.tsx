import { getRoundCount, getRoundName } from '@/lib/bracket'
import { Badge } from '@/components/ui/badge'
import type { KnockoutMatchup, Result } from '@/types'

interface BracketViewProps {
  matchups: KnockoutMatchup[]
  results?: Result[]
  teamCount: number
  /** When provided, highlights the user's picks */
  userPicks?: Array<{ round: number; matchup_index: number; picked_team: string }>
}

export default function BracketView({ matchups, results = [], teamCount, userPicks }: BracketViewProps) {
  const totalRounds = getRoundCount(teamCount)

  if (totalRounds === 0) {
    return <p className="text-sm text-muted-foreground">Not enough teams for a bracket.</p>
  }

  return (
    <div className="space-y-6">
      {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
        const roundMatchups = matchups
          .filter((m) => m.round === round)
          .sort((a, b) => a.matchup_index - b.matchup_index)

        return (
          <div key={round}>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              {getRoundName(round, totalRounds)}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {roundMatchups.map((m) => {
                const result = results.find(
                  (r) => r.round === round && r.matchup_index === m.matchup_index,
                )
                const userPick = userPicks?.find(
                  (p) => p.round === round && p.matchup_index === m.matchup_index,
                )

                const teamA = m.team_a ?? m.group_source_a ?? 'TBD'
                const teamB = m.team_b ?? m.group_source_b ?? 'TBD'

                return (
                  <div
                    key={m.id}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 text-sm">
                        <div className={result?.winning_team === teamA ? 'font-bold' : ''}>
                          {teamA}
                          {userPick?.picked_team === teamA && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Your pick
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">vs</div>
                        <div className={result?.winning_team === teamB ? 'font-bold' : ''}>
                          {teamB}
                          {userPick?.picked_team === teamB && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Your pick
                            </Badge>
                          )}
                        </div>
                      </div>
                      {result && (
                        <Badge variant="default" className="text-xs">
                          {result.winning_team}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
