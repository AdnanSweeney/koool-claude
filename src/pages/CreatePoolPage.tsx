import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { generateInviteCode } from '@/lib/invite-code'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import StepBasicInfo from '@/components/pool-creation/StepBasicInfo'
import StepDefineTeams from '@/components/pool-creation/StepDefineTeams'
import StepConfigureGroups from '@/components/pool-creation/StepConfigureGroups'
import StepConfigureBracket from '@/components/pool-creation/StepConfigureBracket'
import StepReview from '@/components/pool-creation/StepReview'
import type {
  StepBasicInfoData,
  StepTeamsData,
  StepGroupsData,
  StepBracketData,
  PoolWizardData,
} from '@/lib/validation'

const MAX_POOLS_PER_USER = 5

const STEP_LABELS = ['Basic Info', 'Teams', 'Groups', 'Bracket', 'Review']

export default function CreatePoolPage() {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const [basicInfo, setBasicInfo] = useState<StepBasicInfoData>({
    name: '',
    sport: '',
    description: '',
    start_datetime: '',
    has_group_stage: false,
  })
  const [teamsData, setTeamsData] = useState<StepTeamsData>({ teams: [] })
  const [groupsData, setGroupsData] = useState<StepGroupsData | null>(null)
  const [bracketData, setBracketData] = useState<StepBracketData | null>(null)

  // Skip groups step if no group stage
  const activeSteps = basicInfo.has_group_stage
    ? [0, 1, 2, 3, 4]
    : [0, 1, 3, 4]

  const currentStepIndex = activeSteps[step] ?? 0

  const goNext = () => setStep((s) => Math.min(s + 1, activeSteps.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    if (!session?.user || !bracketData) return

    try {
      setSubmitting(true)

      // Check pool limit
      const { count } = await supabase
        .from('pools')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', session.user.id)

      if ((count ?? 0) >= MAX_POOLS_PER_USER) {
        toast.error(`You can create a maximum of ${MAX_POOLS_PER_USER} pools.`)
        return
      }

      const inviteCode = await generateInviteCode()

      // Create the pool
      const { data: pool, error: poolError } = await supabase
        .from('pools')
        .insert({
          creator_id: session.user.id,
          name: basicInfo.name,
          description: basicInfo.description || null,
          sport: basicInfo.sport,
          status: 'upcoming',
          teams: teamsData.teams,
          has_group_stage: basicInfo.has_group_stage,
          advance_per_group: groupsData?.advance_per_group ?? null,
          additional_advancing: groupsData?.additional_advancing ?? 0,
          start_datetime: new Date(basicInfo.start_datetime).toISOString(),
          invite_code: inviteCode,
        })
        .select()
        .single()

      if (poolError) throw poolError

      // Add creator as member
      await supabase
        .from('pool_members')
        .insert({ pool_id: pool.id, user_id: session.user.id })

      // Create groups if group stage
      if (basicInfo.has_group_stage && groupsData) {
        const groupInserts = groupsData.groups.map((g) => ({
          pool_id: pool.id,
          name: g.name,
          teams: g.teams,
        }))
        const { error: groupError } = await supabase
          .from('groups')
          .insert(groupInserts)

        if (groupError) throw groupError
      }

      // Create knockout matchups
      const matchupInserts = bracketData.matchups.map((m, i) => ({
        pool_id: pool.id,
        round: 1,
        matchup_index: i,
        team_a: m.team_a,
        team_b: m.team_b,
        group_source_a: m.group_source_a ?? null,
        group_source_b: m.group_source_b ?? null,
      }))
      const { error: matchupError } = await supabase
        .from('knockout_matchups')
        .insert(matchupInserts)

      if (matchupError) throw matchupError

      toast.success('Pool created!')
      navigate(`/pools/${pool.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create pool')
    } finally {
      setSubmitting(false)
    }
  }

  const wizardData: PoolWizardData = {
    basicInfo,
    teams: teamsData,
    groups: groupsData,
    bracket: bracketData ?? { matchups: [] },
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-1">
          {activeSteps.map((stepIdx, i) => (
            <div
              key={stepIdx}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create a Pool</CardTitle>
            <CardDescription>
              Step {step + 1} of {activeSteps.length}: {STEP_LABELS[currentStepIndex]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentStepIndex === 0 && (
              <StepBasicInfo
                defaultValues={basicInfo}
                onNext={(data) => {
                  setBasicInfo(data)
                  if (!data.has_group_stage) {
                    setGroupsData(null)
                  }
                  goNext()
                }}
                onCancel={() => navigate('/dashboard')}
              />
            )}

            {currentStepIndex === 1 && (
              <StepDefineTeams
                defaultValues={teamsData}
                onNext={(data) => {
                  setTeamsData(data)
                  goNext()
                }}
                onBack={goBack}
              />
            )}

            {currentStepIndex === 2 && (
              <StepConfigureGroups
                teams={teamsData.teams}
                defaultValues={groupsData}
                onNext={(data) => {
                  setGroupsData(data)
                  goNext()
                }}
                onBack={goBack}
              />
            )}

            {currentStepIndex === 3 && (
              <StepConfigureBracket
                teams={teamsData.teams}
                hasGroupStage={basicInfo.has_group_stage}
                groupsData={groupsData}
                defaultValues={bracketData}
                onNext={(data) => {
                  setBracketData(data)
                  goNext()
                }}
                onBack={goBack}
              />
            )}

            {currentStepIndex === 4 && (
              <StepReview
                data={wizardData}
                onSubmit={handleSubmit}
                onBack={goBack}
                submitting={submitting}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
