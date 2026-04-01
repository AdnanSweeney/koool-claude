import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

interface AuthState {
  session: Session | null
  profile: User | null
  loading: boolean
  initialize: () => () => void
  fetchProfile: (userId: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  setProfile: (profile: User) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  initialize: () => {
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session })
      if (session?.user) {
        get().fetchProfile(session.user.id)
      } else {
        set({ loading: false })
      }
    })

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session })
      if (session?.user) {
        get().fetchProfile(session.user.id)
      } else {
        set({ profile: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  },

  fetchProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      set({ profile: null, loading: false })
      return
    }

    set({ profile: data as User, loading: false })
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  },

  signInWithMagicLink: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    set({ session: null, profile: null })
  },

  setProfile: (profile: User) => {
    set({ profile })
  },
}))
