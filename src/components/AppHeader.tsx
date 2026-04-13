import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

interface AppHeaderProps {
  right?: React.ReactNode
}

export function AppHeader({ right }: AppHeaderProps) {
  const { profile, signOut } = useAuthStore()

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 md:px-12 py-3">
        <Link to="/dashboard" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          Koool
        </Link>
        <div className="flex items-center gap-2">
          {right}
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {profile?.display_name}
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
