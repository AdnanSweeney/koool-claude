import { Badge } from '@/components/ui/badge'
import type { Group } from '@/types'

interface GroupTableProps {
  group: Group
  /** Highlights the user's picks for this group */
  userAdvancingPicks?: string[]
}

export default function GroupTable({ group, userAdvancingPicks }: GroupTableProps) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/50 px-3 py-2">
        <h4 className="text-sm font-semibold">{group.name}</h4>
      </div>
      <ul className="divide-y">
        {(group.teams as string[]).map((team) => {
          const isAdvancing = group.advancing_teams?.includes(team)
          const isPicked = userAdvancingPicks?.includes(team)

          return (
            <li key={team} className="flex items-center justify-between px-3 py-2">
              <span className={`text-sm ${isAdvancing ? 'font-bold' : ''}`}>
                {team}
              </span>
              <div className="flex gap-1">
                {isPicked && (
                  <Badge variant="outline" className="text-xs">Your pick</Badge>
                )}
                {isAdvancing && (
                  <Badge variant="default" className="text-xs">Advanced</Badge>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
