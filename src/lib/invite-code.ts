import { supabase } from '@/lib/supabase'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function randomCode(length = 8): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => CHARS[byte % CHARS.length]).join('')
}

export async function generateInviteCode(maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const code = randomCode()
    const { data } = await supabase
      .from('pools')
      .select('id')
      .eq('invite_code', code)
      .maybeSingle()

    if (!data) return code
  }
  throw new Error('Failed to generate a unique invite code after multiple attempts')
}
