import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  const { profile, signOut } = useAuthStore()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome{profile?.display_name ? `, ${profile.display_name}` : ''}!
      </p>
      <Button variant="outline" className="mt-6" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
