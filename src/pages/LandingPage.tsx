import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'

function BracketIllustration() {
  return (
    <svg
      viewBox="0 0 360 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-sm"
      aria-hidden="true"
    >
      {/* R1 — winner boxes */}
      <rect x="10" y="20" width="90" height="32" rx="6" className="fill-amber-500/10 stroke-amber-500/60" strokeWidth="1.5" />
      <text x="55" y="41" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-amber-400">Brazil</text>

      <rect x="10" y="68" width="90" height="32" rx="6" className="fill-muted stroke-border" strokeWidth="1.5" />
      <text x="55" y="82" textAnchor="middle" fontSize="11" fontWeight="600" className="fill-muted-foreground">France</text>
      <line x1="20" y1="88" x2="90" y2="88" className="stroke-muted-foreground/40" strokeWidth="1.5" />

      <rect x="10" y="140" width="90" height="32" rx="6" className="fill-muted stroke-border" strokeWidth="1.5" />
      <text x="55" y="154" textAnchor="middle" fontSize="11" fontWeight="600" className="fill-muted-foreground">Spain</text>
      <line x1="20" y1="160" x2="90" y2="160" className="stroke-muted-foreground/40" strokeWidth="1.5" />

      <rect x="10" y="188" width="90" height="32" rx="6" className="fill-amber-500/10 stroke-amber-500/60" strokeWidth="1.5" />
      <text x="55" y="209" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-amber-400">England</text>

      {/* R1 connector lines */}
      <path d="M100 36 H130 V84 H100" className="stroke-amber-500/30" strokeWidth="1.5" fill="none" />
      <line x1="130" y1="60" x2="160" y2="60" className="stroke-amber-500/30" strokeWidth="1.5" />
      <path d="M100 156 H130 V204 H100" className="stroke-amber-500/30" strokeWidth="1.5" fill="none" />
      <line x1="130" y1="180" x2="160" y2="180" className="stroke-amber-500/30" strokeWidth="1.5" />

      {/* R2 boxes */}
      <rect x="160" y="44" width="90" height="32" rx="6" className="fill-amber-500/20 stroke-amber-500" strokeWidth="1.5" />
      <text x="205" y="65" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-amber-400">Brazil</text>

      <rect x="160" y="164" width="90" height="32" rx="6" className="fill-amber-500/10 stroke-amber-500/60" strokeWidth="1.5" />
      <text x="205" y="185" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-amber-400">England</text>

      {/* R2 connector lines */}
      <path d="M250 60 H280 V180 H250" className="stroke-amber-500/30" strokeWidth="1.5" fill="none" />
      <line x1="280" y1="120" x2="310" y2="120" className="stroke-amber-500/30" strokeWidth="1.5" />

      {/* Final box */}
      <rect x="310" y="104" width="44" height="32" rx="6" className="fill-amber-500" />
      <text x="332" y="125" textAnchor="middle" fontSize="14" fontWeight="900" fill="black">?</text>
    </svg>
  )
}

const features = [
  {
    icon: '🏆',
    title: 'Create your tournament',
    description: 'Define teams, groups, and brackets exactly how you want.',
  },
  {
    icon: '📨',
    title: 'Invite friends',
    description: 'Share a link and they\'re in.',
  },
  {
    icon: '🎯',
    title: 'Pick your bracket',
    description: 'Drag to rank groups, click to pick knockout winners.',
  },
  {
    icon: '📊',
    title: 'Track scores',
    description: 'Live leaderboard with round-by-round scoring.',
  },
]

export default function LandingPage() {
  const { session } = useAuthStore()

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-border/50">
        <span className="text-2xl font-black tracking-tight">Koool</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex-1 overflow-hidden">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 25% 50%, color-mix(in srgb, #f59e0b 12%, transparent) 0%, transparent 60%)',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 md:px-12 py-20 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-5xl md:text-6xl font-black leading-tight tracking-tight mb-5">
              Tournament pools,{' '}
              <span className="text-amber-500">made easy.</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto md:mx-0 leading-relaxed">
              Build your own bracket pool in minutes. Invite friends, rank groups, pick winners, and see who called it.
            </p>
            {session ? (
              <Button asChild size="lg" className="font-bold">
                <Link to="/dashboard">Go to Dashboard →</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="font-bold">
                <Link to="/auth">Get Started →</Link>
              </Button>
            )}
          </div>

          <div className="flex-1 flex justify-center w-full">
            <BracketIllustration />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl w-full px-6 md:px-12 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-base mb-1.5">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 md:px-12 py-5 flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-black text-foreground text-lg">Koool</span>
        <span>© 2025 Koool &middot; Made by radnan</span>
      </footer>
    </div>
  )
}
