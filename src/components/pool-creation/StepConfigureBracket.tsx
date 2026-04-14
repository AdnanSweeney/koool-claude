import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateGroupSourceLabels, getRoundCount, getMatchupCount } from '@/lib/bracket'
import type { StepBracketData } from '@/lib/validation'
import type { StepGroupsData } from '@/lib/validation'

interface MatchupDraft {
  team_a: string
  team_b: string
  group_source_a: string | null
  group_source_b: string | null
}

interface Props {
  teams: string[]
  hasGroupStage: boolean
  groupsData: StepGroupsData | null
  defaultValues: StepBracketData | null
  onNext: (data: StepBracketData) => void
  onBack: () => void
}

export default function StepConfigureBracket({
  teams,
  hasGroupStage,
  groupsData,
  defaultValues,
  onNext,
  onBack,
}: Props) {
  const [error, setError] = useState<string | null>(null)

  // Determine available slots for R1
  const availableSlots: string[] = hasGroupStage && groupsData
    ? generateGroupSourceLabels(
        groupsData.groups.map((g) => g.name),
        groupsData.advance_per_group,
        groupsData.additional_advancing ?? 0,
      )
    : teams

  const knockoutTeamCount = availableSlots.length
  const r1MatchupCount = getMatchupCount(knockoutTeamCount, 1)

  const [matchups, setMatchups] = useState<MatchupDraft[]>(() => {
    if (defaultValues && defaultValues.matchups.length > 0) {
      return defaultValues.matchups.map((m) => ({
        team_a: m.team_a,
        team_b: m.team_b,
        group_source_a: m.group_source_a ?? null,
        group_source_b: m.group_source_b ?? null,
      }))
    }
    return Array.from({ length: r1MatchupCount }, () => ({
      team_a: '',
      team_b: '',
      group_source_a: null,
      group_source_b: null,
    }))
  })

  useEffect(() => {
    // Resize matchups if team count changes
    if (matchups.length !== r1MatchupCount) {
      setMatchups(
        Array.from({ length: r1MatchupCount }, (_, i) =>
          matchups[i] ?? { team_a: '', team_b: '', group_source_a: null, group_source_b: null },
        ),
      )
    }
  }, [r1MatchupCount])

  const assignedSlots = new Set(
    matchups.flatMap((m) => [m.team_a, m.team_b]).filter((s) => s),
  )
  const unassignedSlots = availableSlots.filter((s) => !assignedSlots.has(s))

  const updateMatchup = (index: number, side: 'team_a' | 'team_b', value: string) => {
    const updated = [...matchups]
    const old = updated[index]
    updated[index] = {
      ...old,
      [side]: value,
      ...(hasGroupStage
        ? { [side === 'team_a' ? 'group_source_a' : 'group_source_b']: value }
        : {}),
    }
    setMatchups(updated)
  }

  const autoAssign = () => {
    const slots = [...availableSlots]
    const auto: MatchupDraft[] = []
    for (let i = 0; i < slots.length - 1; i += 2) {
      auto.push({
        team_a: slots[i],
        team_b: slots[i + 1],
        group_source_a: hasGroupStage ? slots[i] : null,
        group_source_b: hasGroupStage ? slots[i + 1] : null,
      })
    }
    setMatchups(auto)
  }

  const handleNext = () => {
    setError(null)

    for (let i = 0; i < matchups.length; i++) {
      if (!matchups[i].team_a || !matchups[i].team_b) {
        setError(`Matchup ${i + 1} is incomplete.`)
        return
      }
    }

    // Check no duplicate assignments
    const all = matchups.flatMap((m) => [m.team_a, m.team_b])
    if (new Set(all).size !== all.length) {
      setError('Each team/slot can only appear in one matchup.')
      return
    }

    onNext({
      matchups: matchups.map((m) => ({
        team_a: m.team_a,
        team_b: m.team_b,
        group_source_a: m.group_source_a,
        group_source_b: m.group_source_b,
      })),
    })
  }

  const totalRounds = getRoundCount(knockoutTeamCount)

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-base font-semibold">Round 1 Matchups</Label>
        <p className="text-xs text-muted-foreground">
          {knockoutTeamCount} {hasGroupStage ? 'slots' : 'teams'} &rarr; {r1MatchupCount} matchups &rarr; {totalRounds} rounds
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={autoAssign}>
          Auto-pair sequentially
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setMatchups(
              Array.from({ length: r1MatchupCount }, () => ({
                team_a: '',
                team_b: '',
                group_source_a: null,
                group_source_b: null,
              })),
            )
          }
        >
          Reset
        </Button>
      </div>

      {unassignedSlots.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Unassigned ({unassignedSlots.length}): {unassignedSlots.join(', ')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {matchups.map((m, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border p-3">
            <span className="w-8 text-xs text-muted-foreground">#{i + 1}</span>
            <Select
              value={m.team_a || undefined}
              onValueChange={(v) => updateMatchup(i, 'team_a', v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {availableSlots
                  .filter((s) => s === m.team_a || !assignedSlots.has(s))
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">vs</span>
            <Select
              value={m.team_b || undefined}
              onValueChange={(v) => updateMatchup(i, 'team_b', v)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {availableSlots
                  .filter((s) => s === m.team_b || !assignedSlots.has(s))
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
