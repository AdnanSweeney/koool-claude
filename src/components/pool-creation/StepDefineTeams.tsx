import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { stepTeamsSchema, type StepTeamsData } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  defaultValues: StepTeamsData
  onNext: (data: StepTeamsData) => void
  onBack: () => void
}

export default function StepDefineTeams({ defaultValues, onNext, onBack }: Props) {
  const [teams, setTeams] = useState<string[]>(
    defaultValues.teams.length > 0 ? defaultValues.teams : ['', ''],
  )
  const [newTeam, setNewTeam] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const {
    handleSubmit,
    setValue,
    formState: { errors },
    trigger,
  } = useForm<StepTeamsData>({
    resolver: zodResolver(stepTeamsSchema),
    defaultValues: { teams: teams.filter((t) => t.trim()) },
  })

  const syncForm = (updated: string[]) => {
    setTeams(updated)
    setValue('teams', updated.filter((t) => t.trim()))
  }

  const addTeam = () => {
    const trimmed = newTeam.trim()
    if (!trimmed) return
    syncForm([...teams, trimmed])
    setNewTeam('')
  }

  const removeTeam = (index: number) => {
    syncForm(teams.filter((_, i) => i !== index))
  }

  const updateTeam = (index: number, value: string) => {
    const updated = [...teams]
    updated[index] = value
    syncForm(updated)
  }

  const addBulkTeams = () => {
    const parsed = bulkText
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t)
    if (parsed.length === 0) return
    const existing = new Set(teams.filter((t) => t.trim()).map((t) => t.toLowerCase()))
    const deduped = parsed.filter((t) => !existing.has(t.toLowerCase()))
    syncForm([...teams.filter((t) => t.trim()), ...deduped])
    setBulkText('')
    setShowBulk(false)
  }

  const bulkCount = bulkText
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t).length

  const handlePaste = (text: string) => {
    const pasted = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t)
    if (pasted.length > 1) {
      syncForm([...teams.filter((t) => t.trim()), ...pasted])
      setNewTeam('')
    }
  }

  const onSubmit = async () => {
    const valid = await trigger()
    if (valid) {
      onNext({ teams: teams.filter((t) => t.trim()) })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label>Teams ({teams.filter((t) => t.trim()).length})</Label>
        <p className="text-xs text-muted-foreground">
          Add teams one by one or paste a comma-separated list.
        </p>
      </div>

      <div className="space-y-2">
        {teams.map((team, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={team}
              onChange={(e) => updateTeam(i, e.target.value)}
              placeholder={`Team ${i + 1}`}
            />
            {teams.length > 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeTeam(i)}
                className="shrink-0"
              >
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a team..."
          value={newTeam}
          onChange={(e) => setNewTeam(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (text.includes(',') || text.includes('\n')) {
              e.preventDefault()
              handlePaste(text)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTeam()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addTeam}>
          Add
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowBulk(!showBulk)}
        >
          {showBulk ? 'Cancel' : 'Bulk Add'}
        </Button>
      </div>

      {showBulk && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Textarea
            placeholder="Paste or type team names, one per line..."
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {bulkCount} team{bulkCount !== 1 ? 's' : ''} detected
            </span>
            <Button type="button" size="sm" onClick={addBulkTeams} disabled={bulkCount === 0}>
              Add {bulkCount} Team{bulkCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {errors.teams && (
        <p className="text-xs text-destructive">{errors.teams.message}</p>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  )
}
