import { z } from 'zod'

export const stepBasicInfoSchema = z.object({
  name: z
    .string()
    .min(3, 'Pool name must be at least 3 characters')
    .max(60, 'Pool name must be at most 60 characters'),
  sport: z
    .string()
    .min(1, 'Sport is required')
    .max(60, 'Sport must be at most 60 characters'),
  description: z
    .string()
    .max(200, 'Description must be at most 200 characters')
    .optional(),
  start_datetime: z.string().min(1, 'Start date is required'),
  has_group_stage: z.boolean(),
})

export const stepTeamsSchema = z.object({
  teams: z
    .array(z.string().min(1, 'Team name cannot be empty'))
    .min(2, 'At least 2 teams are required')
    .refine(
      (teams) => new Set(teams).size === teams.length,
      { message: 'Team names must be unique' },
    ),
})

export const stepGroupsSchema = z.object({
  groups: z
    .array(
      z.object({
        name: z.string().min(1, 'Group name is required'),
        teams: z.array(z.string()).min(1, 'Each group must have at least one team'),
      }),
    )
    .min(2, 'At least 2 groups are required'),
  advance_per_group: z
    .number()
    .int()
    .min(1, 'At least 1 team must advance per group'),
}).refine(
  (data) => data.groups.every((g) => g.teams.length > data.advance_per_group),
  { message: 'Each group must have more teams than the number that advance' },
).refine(
  (data) => {
    const allTeams = data.groups.flatMap((g) => g.teams)
    return new Set(allTeams).size === allTeams.length
  },
  { message: 'A team cannot appear in multiple groups' },
)

export const stepBracketSchema = z.object({
  matchups: z
    .array(
      z.object({
        team_a: z.string().min(1),
        team_b: z.string().min(1),
        group_source_a: z.string().nullable().optional(),
        group_source_b: z.string().nullable().optional(),
      }),
    )
    .min(1, 'At least 1 matchup is required'),
})

export type StepBasicInfoData = z.infer<typeof stepBasicInfoSchema>
export type StepTeamsData = z.infer<typeof stepTeamsSchema>
export type StepGroupsData = z.infer<typeof stepGroupsSchema>
export type StepBracketData = z.infer<typeof stepBracketSchema>

export interface PoolWizardData {
  basicInfo: StepBasicInfoData
  teams: StepTeamsData
  groups: StepGroupsData | null
  bracket: StepBracketData
}
