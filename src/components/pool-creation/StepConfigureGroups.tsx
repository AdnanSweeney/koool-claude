import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StepGroupsData } from '@/lib/validation'

interface GroupDraft {
  name: string
  teams: string[]
}

interface Props {
  teams: string[]
  defaultValues: StepGroupsData | null
  onNext: (data: StepGroupsData) => void
  onBack: () => void
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export default function StepConfigureGroups({ teams, defaultValues, onNext, onBack }: Props) {
  const [groupCount, setGroupCount] = useState(defaultValues?.groups.length ?? 2)
  const [advancePerGroup, setAdvancePerGroup] = useState(defaultValues?.advance_per_group ?? 1)
  const [additionalAdvancing, setAdditionalAdvancing] = useState(defaultValues?.additional_advancing ?? 0)
  const [groups, setGroups] = useState<GroupDraft[]>(() => {
    if (defaultValues) {
      return defaultValues.groups.map((g) => ({ name: g.name, teams: [...g.teams] }))
    }
    return Array.from({ length: 2 }, (_, i) => ({
      name: `Group ${GROUP_LETTERS[i]}`,
      teams: [],
    }))
  })
  const [error, setError] = useState<string | null>(null)

  const assignedTeams = new Set(groups.flatMap((g) => g.teams))
  const unassignedTeams = teams.filter((t) => !assignedTeams.has(t))

  useEffect(() => {
    // Adjust group count
    if (groupCount > groups.length) {
      setGroups([
        ...groups,
        ...Array.from({ length: groupCount - groups.length }, (_, i) => ({
          name: `Group ${GROUP_LETTERS[groups.length + i]}`,
          teams: [],
        })),
      ])
    } else if (groupCount < groups.length) {
      // Move removed groups' teams back to unassigned
      const kept = groups.slice(0, groupCount)
      setGroups(kept)
    }
  }, [groupCount])

  const addTeamToGroup = (groupIndex: number, team: string) => {
    const updated = [...groups]
    updated[groupIndex] = {
      ...updated[groupIndex],
      teams: [...updated[groupIndex].teams, team],
    }
    setGroups(updated)
  }

  const removeTeamFromGroup = (groupIndex: number, team: string) => {
    const updated = [...groups]
    updated[groupIndex] = {
      ...updated[groupIndex],
      teams: updated[groupIndex].teams.filter((t) => t !== team),
    }
    setGroups(updated)
  }

  const autoDistribute = () => {
    const allTeams = [...teams]
    const newGroups = Array.from({ length: groupCount }, (_, i) => ({
      name: `Group ${GROUP_LETTERS[i]}`,
      teams: [] as string[],
    }))
    allTeams.forEach((team, i) => {
      newGroups[i % groupCount].teams.push(team)
    })
    setGroups(newGroups)
  }

  const handleNext = () => {
    setError(null)

    if (unassignedTeams.length > 0) {
      setError(`${unassignedTeams.length} team(s) are not assigned to a group.`)
      return
    }

    for (const g of groups) {
      if (g.teams.length <= advancePerGroup) {
        setError(`"${g.name}" must have more teams than the number that advance (${advancePerGroup}).`)
        return
      }
    }

    onNext({
      groups: groups.map((g) => ({ name: g.name, teams: g.teams })),
      advance_per_group: advancePerGroup,
      additional_advancing: additionalAdvancing,
    })
  }

  // Use theoretical max (teams per group) so the dropdown works before distributing
  const teamsPerGroup = Math.floor(teams.length / groupCount)
  const maxAdvance = Math.max(teamsPerGroup - 1, 1)

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <div className="space-y-1.5">
          <Label>Number of Groups</Label>
          <Select
            value={String(groupCount)}
            onValueChange={(v) => setGroupCount(Number(v))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: Math.min(Math.floor(teams.length / 2), 12) }, (_, i) => i + 2).map(
                (n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Advance per Group</Label>
          <Select
            value={String(advancePerGroup)}
            onValueChange={(v) => setAdvancePerGroup(Number(v))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: Math.max(maxAdvance, 1) }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Top {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Additional Advancing Teams</Label>
        <p className="text-xs text-muted-foreground">
          e.g. best 8 third-place teams in a World Cup format. Set to 0 for none.
        </p>
        <Input
          type="number"
          min={0}
          max={groupCount}
          className="w-24"
          value={additionalAdvancing}
          onChange={(e) => setAdditionalAdvancing(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
      </div>

      <Button type="button" variant="outline" size="sm" onClick={autoDistribute}>
        Auto-distribute teams
      </Button>

      {/* Unassigned teams */}
      {unassignedTeams.length > 0 && (
        <div className="space-y-1.5">
          <Label>Unassigned Teams ({unassignedTeams.length})</Label>
          <div className="flex flex-wrap gap-1">
            {unassignedTeams.map((team) => (
              <span
                key={team}
                className="rounded-md border bg-muted px-2 py-1 text-xs"
              >
                {team}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Groups */}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group, gi) => (
          <div key={gi} className="flex flex-col rounded-lg border p-3 min-h-36">
            <Input
              value={group.name}
              onChange={(e) => {
                const updated = [...groups]
                updated[gi] = { ...updated[gi], name: e.target.value }
                setGroups(updated)
              }}
              className="mb-2 h-7 text-sm font-semibold"
            />

            <ul className="mb-2 flex-1 space-y-0.5">
              {group.teams.map((team) => (
                <li key={team} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
                  <span className="truncate text-sm">{team}</span>
                  <button
                    type="button"
                    onClick={() => removeTeamFromGroup(gi, team)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>

            {unassignedTeams.length > 0 && (
              <Select onValueChange={(team) => addTeamToGroup(gi, team)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Add team…" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTeams.map((team) => (
                    <SelectItem key={team} value={team}>
                      {team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
