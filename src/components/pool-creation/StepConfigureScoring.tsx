import { useEffect, useState } from 'react'
import { getRoundCount } from '@/lib/bracket'
import { stepScoringSchema, type StepScoringData, type StepBracketData } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  hasGroupStage: boolean
  bracketData: StepBracketData
  defaultValues: StepScoringData
  onNext: (data: StepScoringData) => void
  onBack: () => void
}

function defaultKnockout(numRounds: number): number[] {
  return Array.from({ length: numRounds }, (_, i) => Math.pow(2, i))
}

export default function StepConfigureScoring({
  hasGroupStage,
  bracketData,
  defaultValues,
  onNext,
  onBack,
}: Props) {
  const numRounds = getRoundCount(bracketData.matchups.length * 2)

  const [group, setGroup] = useState(defaultValues.group)
  const [knockout, setKnockout] = useState<number[]>(() => {
    const def = defaultKnockout(numRounds)
    return def.map((fallback, i) => defaultValues.knockout[i] ?? fallback)
  })
  const [error, setError] = useState<string | null>(null)

  // Resize the knockout array when numRounds changes (user navigated back and changed teams)
  useEffect(() => {
    setKnockout((prev) =>
      Array.from({ length: numRounds }, (_, i) => prev[i] ?? Math.pow(2, i)),
    )
  }, [numRounds])

  const setKnockoutRound = (i: number, value: number) => {
    setKnockout((prev) => prev.map((v, idx) => (idx === i ? value : v)))
  }

  const handleNext = () => {
    const result = stepScoringSchema.safeParse({ group, knockout })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid scoring config')
      return
    }
    onNext(result.data)
  }

  const roundLabel = (i: number) => {
    if (numRounds === 1) return 'Final'
    if (i === numRounds - 1) return 'Final'
    if (i === numRounds - 2) return 'Semi-final'
    if (i === numRounds - 3) return 'Quarter-final'
    return `Round ${i + 1}`
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Set how many points are awarded for each correct prediction. These will be shown to all
        pool members.
      </p>

      {hasGroupStage && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Group Stage</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label htmlFor="group-pts">Points per correct advancing team pick</Label>
            </div>
            <Input
              id="group-pts"
              type="number"
              min={0}
              className="w-20 text-center"
              value={group}
              onChange={(e) => setGroup(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Knockout Rounds</h3>
        <p className="text-xs text-muted-foreground">Points for a correct pick in each round.</p>
        <div className="space-y-2">
          {knockout.map((pts, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{roundLabel(i)}</span>
              <Input
                type="number"
                min={0}
                className="w-20 text-center"
                value={pts}
                onChange={(e) => setKnockoutRound(i, Math.max(0, Number(e.target.value)))}
              />
              <span className="w-6 text-xs text-muted-foreground">pts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary preview */}
      <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Point breakdown</p>
        {hasGroupStage && (
          <p>Group stage: {group} pt{group !== 1 ? 's' : ''} per correct advancing team</p>
        )}
        {knockout.map((pts, i) => (
          <p key={i}>{roundLabel(i)}: {pts} pt{pts !== 1 ? 's' : ''} per correct pick</p>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext}>Next</Button>
      </div>
    </div>
  )
}
