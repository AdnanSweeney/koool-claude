import { describe, it, expect } from 'vitest'
import {
  stepBasicInfoSchema,
  stepTeamsSchema,
  stepGroupsSchema,
  stepBracketSchema,
} from '../validation'

describe('stepBasicInfoSchema', () => {
  const validData = {
    name: 'My Pool',
    sport: 'Football',
    start_datetime: '2026-07-01T10:00:00Z',
    has_group_stage: false,
  }

  it('accepts valid basic info', () => {
    expect(stepBasicInfoSchema.safeParse(validData).success).toBe(true)
  })

  it('rejects name shorter than 3 chars', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, name: 'AB' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 60 chars', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, name: 'A'.repeat(61) })
    expect(result.success).toBe(false)
  })

  it('rejects empty sport', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, sport: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty start_datetime', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, start_datetime: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional description', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, description: 'A fun pool' })
    expect(result.success).toBe(true)
  })

  it('rejects description over 200 chars', () => {
    const result = stepBasicInfoSchema.safeParse({ ...validData, description: 'X'.repeat(201) })
    expect(result.success).toBe(false)
  })
})

describe('stepTeamsSchema', () => {
  it('accepts 2+ unique teams', () => {
    expect(stepTeamsSchema.safeParse({ teams: ['A', 'B'] }).success).toBe(true)
  })

  it('rejects fewer than 2 teams', () => {
    expect(stepTeamsSchema.safeParse({ teams: ['A'] }).success).toBe(false)
    expect(stepTeamsSchema.safeParse({ teams: [] }).success).toBe(false)
  })

  it('rejects duplicate team names', () => {
    const result = stepTeamsSchema.safeParse({ teams: ['A', 'B', 'A'] })
    expect(result.success).toBe(false)
  })

  it('rejects empty team names', () => {
    const result = stepTeamsSchema.safeParse({ teams: ['A', ''] })
    expect(result.success).toBe(false)
  })
})

describe('stepGroupsSchema', () => {
  it('accepts valid group configuration', () => {
    const result = stepGroupsSchema.safeParse({
      groups: [
        { name: 'Group A', teams: ['A', 'B', 'C'] },
        { name: 'Group B', teams: ['D', 'E', 'F'] },
      ],
      advance_per_group: 2,
    })
    expect(result.success).toBe(true)
  })

  it('rejects fewer than 2 groups', () => {
    const result = stepGroupsSchema.safeParse({
      groups: [{ name: 'Group A', teams: ['A', 'B', 'C'] }],
      advance_per_group: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects advance_per_group >= group size', () => {
    const result = stepGroupsSchema.safeParse({
      groups: [
        { name: 'Group A', teams: ['A', 'B'] },
        { name: 'Group B', teams: ['C', 'D'] },
      ],
      advance_per_group: 2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects teams appearing in multiple groups', () => {
    const result = stepGroupsSchema.safeParse({
      groups: [
        { name: 'Group A', teams: ['A', 'B', 'C'] },
        { name: 'Group B', teams: ['A', 'D', 'E'] },
      ],
      advance_per_group: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects advance_per_group < 1', () => {
    const result = stepGroupsSchema.safeParse({
      groups: [
        { name: 'Group A', teams: ['A', 'B', 'C'] },
        { name: 'Group B', teams: ['D', 'E', 'F'] },
      ],
      advance_per_group: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('stepBracketSchema', () => {
  it('accepts valid matchups', () => {
    const result = stepBracketSchema.safeParse({
      matchups: [
        { team_a: 'A', team_b: 'B' },
        { team_a: 'C', team_b: 'D' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty matchups array', () => {
    expect(stepBracketSchema.safeParse({ matchups: [] }).success).toBe(false)
  })

  it('rejects matchup with empty team names', () => {
    const result = stepBracketSchema.safeParse({
      matchups: [{ team_a: '', team_b: 'B' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts matchups with group sources', () => {
    const result = stepBracketSchema.safeParse({
      matchups: [
        { team_a: 'A1', team_b: 'B2', group_source_a: 'A1', group_source_b: 'B2' },
      ],
    })
    expect(result.success).toBe(true)
  })
})
