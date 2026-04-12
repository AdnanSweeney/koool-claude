import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PoolWizardData } from '@/lib/validation'

interface Props {
  data: PoolWizardData
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
}

export default function StepReview({ data, onSubmit, onBack, submitting }: Props) {
  const { basicInfo, teams, groups, bracket } = data

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Basic Info</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="font-medium">Name:</dt>
            <dd>{basicInfo.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Sport:</dt>
            <dd>{basicInfo.sport}</dd>
          </div>
          {basicInfo.description && (
            <div className="flex gap-2">
              <dt className="font-medium">Description:</dt>
              <dd>{basicInfo.description}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="font-medium">Start:</dt>
            <dd>{new Date(basicInfo.start_datetime).toLocaleString()}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium">Format:</dt>
            <dd>{basicInfo.has_group_stage ? 'Groups + Knockout' : 'Knockout only'}</dd>
          </div>
        </dl>
      </section>

      {/* Teams */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Teams ({teams.teams.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {teams.teams.map((t) => (
            <Badge key={t} variant="outline">{t}</Badge>
          ))}
        </div>
      </section>

      {/* Groups */}
      {groups && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Groups (top {groups.advance_per_group} advance)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.groups.map((g) => (
              <div key={g.name} className="rounded-md border p-2">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.teams.join(', ')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bracket */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Round 1 Matchups ({bracket.matchups.length})
        </h3>
        <div className="space-y-1">
          {bracket.matchups.map((m, i) => (
            <p key={i} className="text-sm">
              <span className="text-muted-foreground">#{i + 1}</span>{' '}
              {m.team_a} vs {m.team_b}
            </p>
          ))}
        </div>
      </section>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Pool'}
        </Button>
      </div>
    </div>
  )
}
