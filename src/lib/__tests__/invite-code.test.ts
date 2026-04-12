import { describe, it, expect, vi } from 'vitest'

// Mock supabase before importing the module
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }),
  },
}))

import { generateInviteCode } from '../invite-code'

describe('generateInviteCode', () => {
  it('returns an 8-character string', async () => {
    const code = await generateInviteCode()
    expect(code).toHaveLength(8)
  })

  it('contains only alphanumeric characters', async () => {
    const code = await generateInviteCode()
    expect(code).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('generates different codes on subsequent calls', async () => {
    const code1 = await generateInviteCode()
    const code2 = await generateInviteCode()
    // Statistically nearly impossible to collide with 62^8 possibilities
    expect(code1).not.toBe(code2)
  })
})
