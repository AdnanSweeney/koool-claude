import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-5xl font-bold tracking-tight">Koool</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Tournament knockout pools with friends
      </p>
      <Button asChild className="mt-8" size="lg">
        <Link to="/auth">Get Started</Link>
      </Button>
    </div>
  )
}
