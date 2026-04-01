import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { User } from '@/types'

const displayNameSchema = z.object({
  display_name: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(30, 'Display name must be at most 30 characters'),
})

type DisplayNameForm = z.infer<typeof displayNameSchema>

export default function DisplayNameModal() {
  const { session, setProfile } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DisplayNameForm>({
    resolver: zodResolver(displayNameSchema),
  })

  const onSubmit = async (data: DisplayNameForm) => {
    if (!session?.user) return

    try {
      setSaving(true)
      setError(null)

      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ display_name: data.display_name })
        .eq('id', session.user.id)
        .select()
        .single()

      if (updateError) throw updateError

      setProfile(updated as User)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update display name'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Welcome to Koool!</DialogTitle>
          <DialogDescription>
            Choose a display name so other players can identify you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              placeholder="e.g. MarchMadnessFan"
              {...register('display_name')}
            />
            {errors.display_name && (
              <p className="text-xs text-destructive">
                {errors.display_name.message}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Continue'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
