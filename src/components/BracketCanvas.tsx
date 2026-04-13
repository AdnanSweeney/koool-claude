import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getRoundCount, getRoundName, getOptionsForMatchup } from '@/lib/bracket'
import type { KnockoutMatchup, Pick as PickChoice, Result } from '@/types'

// ─── Layout constants ────────────────────────────────────────────────────────

const CARD_W = 180
const CARD_H = 67 // 2 rows × 32px + 1px divider + 2px border
const ROW_H = 32
const GAP_X = 52  // horizontal space between columns for connector lines
const SLOT_BASE = 96 // minimum vertical slot per matchup in round 1
const PAD_X = 16
const PAD_Y = 24
const HEADER_H = 28 // room for round name labels

// ─── Position helpers ────────────────────────────────────────────────────────

function innerHeight(totalRounds: number) {
  return Math.pow(2, totalRounds - 1) * SLOT_BASE
}

function cardPos(round: number, matchupIndex: number, totalRounds: number) {
  const h = innerHeight(totalRounds)
  const matchupsInRound = Math.pow(2, totalRounds - round)
  const slotH = h / matchupsInRound
  const x = PAD_X + (round - 1) * (CARD_W + GAP_X)
  const y = PAD_Y + HEADER_H + matchupIndex * slotH + (slotH - CARD_H) / 2
  return { x, y }
}

function canvasSize(totalRounds: number) {
  const h = innerHeight(totalRounds)
  return {
    w: PAD_X * 2 + totalRounds * (CARD_W + GAP_X) - GAP_X,
    h: PAD_Y * 2 + HEADER_H + h,
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BracketMode = 'pick' | 'view' | 'results'

export interface BracketCanvasProps {
  matchups: KnockoutMatchup[]
  teamCount: number
  mode: BracketMode
  /** Current user's picks (pick mode) or viewed user's picks (view mode) */
  picks?: PickChoice[]
  /** Actual results entered by pool creator */
  results?: Result[]
  /** Called when user clicks a team in pick mode */
  onPick?: (round: number, matchupIndex: number, team: string) => void
  disabled?: boolean
}

// ─── Team row ────────────────────────────────────────────────────────────────

interface TeamRowProps {
  team: string | null
  isPicked: boolean
  isResult: boolean
  mode: BracketMode
  hasResult: boolean
  hasPick: boolean
  clickable: boolean
  onClick: () => void
}

function TeamRow({ team, isPicked, isResult, mode, hasResult, hasPick, clickable, onClick }: TeamRowProps) {
  const isLoser =
    (mode === 'pick' && hasPick && isPicked === false && team !== null) ||
    (mode === 'results' && isResult === false && hasResult && team !== null)

  const rowBg =
    mode === 'view' && isPicked
      ? hasResult
        ? isResult
          ? 'bg-green-500/20'
          : 'bg-red-500/20'
        : 'bg-amber-500/20'
      : ''

  const showCheck = (mode === 'pick' && isPicked) || (mode === 'results' && isResult)

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      style={{ height: ROW_H }}
      className={cn(
        'flex w-full items-center gap-1.5 px-2 text-left text-xs',
        clickable ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
        rowBg,
        isLoser && 'opacity-40',
        (mode === 'pick' && isPicked) || (mode === 'results' && isResult)
          ? 'font-semibold'
          : '',
      )}
    >
      <span className="flex h-3 w-3 shrink-0 items-center justify-center">
        {showCheck && <Check className="h-3 w-3 text-primary" />}
      </span>
      <span className={cn('flex-1 truncate', isLoser && 'line-through')}>
        {team ?? <span className="text-muted-foreground/60 italic">TBD</span>}
      </span>
    </button>
  )
}

// ─── Matchup card ────────────────────────────────────────────────────────────

interface MatchupCardProps {
  round: number
  matchupIndex: number
  teamA: string | null
  teamB: string | null
  pickedTeam: string | null
  resultTeam: string | null
  mode: BracketMode
  disabled: boolean
  onPick?: (round: number, matchupIndex: number, team: string) => void
  x: number
  y: number
}

function MatchupCard({
  round,
  matchupIndex,
  teamA,
  teamB,
  pickedTeam,
  resultTeam,
  mode,
  disabled,
  onPick,
  x,
  y,
}: MatchupCardProps) {
  const canClick = mode === 'pick' && !disabled

  function handleClick(team: string | null) {
    if (!canClick || !team) return
    onPick?.(round, matchupIndex, team)
  }

  const rowProps = (team: string | null) => ({
    team,
    isPicked: team !== null && team === pickedTeam,
    isResult: team !== null && team === resultTeam,
    mode,
    hasResult: resultTeam !== null,
    hasPick: pickedTeam !== null,
    clickable: canClick && team !== null,
    onClick: () => handleClick(team),
  })

  return (
    <div
      className="absolute overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
    >
      <TeamRow {...rowProps(teamA)} />
      <div className="h-px bg-border" />
      <TeamRow {...rowProps(teamB)} />
    </div>
  )
}

// ─── BracketCanvas ───────────────────────────────────────────────────────────

export default function BracketCanvas({
  matchups,
  teamCount,
  mode,
  picks = [],
  results = [],
  onPick,
  disabled = false,
}: BracketCanvasProps) {
  const totalRounds = getRoundCount(teamCount)

  if (totalRounds === 0) {
    return <p className="text-sm text-muted-foreground">Not enough teams for a bracket.</p>
  }

  const { w, h } = canvasSize(totalRounds)

  // Build SVG connector paths (one path per "join" from round R to R+1)
  const connectors: string[] = []
  for (let round = 1; round < totalRounds; round++) {
    const nextCount = Math.pow(2, totalRounds - (round + 1))
    for (let k = 0; k < nextCount; k++) {
      const posA = cardPos(round, k * 2, totalRounds)
      const posB = cardPos(round, k * 2 + 1, totalRounds)
      const posC = cardPos(round + 1, k, totalRounds)

      const exitX = posA.x + CARD_W
      const midX = exitX + GAP_X / 2
      const entryX = posC.x
      const y1 = posA.y + CARD_H / 2
      const y2 = posB.y + CARD_H / 2
      const midY = (y1 + y2) / 2

      // Two horizontals + vertical at midX + horizontal to next card
      connectors.push(
        `M ${exitX},${y1} H ${midX} V ${y2} M ${exitX},${y2} H ${midX} M ${midX},${midY} H ${entryX}`,
      )
    }
  }

  // Collect all cards to render (iterate mathematically — R2+ may have no DB record)
  const cards: Array<{
    key: string
    round: number
    matchupIndex: number
  }> = []
  for (let round = 1; round <= totalRounds; round++) {
    const count = Math.pow(2, totalRounds - round)
    for (let idx = 0; idx < count; idx++) {
      cards.push({ key: `${round}-${idx}`, round, matchupIndex: idx })
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: w, height: h }}>
        {/* Round name labels */}
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
          const x = PAD_X + (round - 1) * (CARD_W + GAP_X)
          return (
            <div
              key={round}
              className="absolute text-xs font-semibold text-muted-foreground"
              style={{ left: x, top: PAD_Y, width: CARD_W, textAlign: 'center' }}
            >
              {getRoundName(round, totalRounds)}
            </div>
          )
        })}

        {/* SVG connector lines */}
        <svg
          className="absolute inset-0 pointer-events-none text-border"
          width={w}
          height={h}
          aria-hidden="true"
        >
          {connectors.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
          ))}
        </svg>

        {/* Matchup cards */}
        {cards.map(({ key, round, matchupIndex }) => {
          const [teamA, teamB] = getOptionsForMatchup(round, matchupIndex, picks, matchups)
          const pos = cardPos(round, matchupIndex, totalRounds)
          const pick = picks.find((p) => p.round === round && p.matchup_index === matchupIndex)
          const result = results.find((r) => r.round === round && r.matchup_index === matchupIndex)

          return (
            <MatchupCard
              key={key}
              round={round}
              matchupIndex={matchupIndex}
              teamA={teamA}
              teamB={teamB}
              pickedTeam={pick?.picked_team ?? null}
              resultTeam={result?.winning_team ?? null}
              mode={mode}
              disabled={disabled}
              onPick={onPick}
              x={pos.x}
              y={pos.y}
            />
          )
        })}
      </div>
    </div>
  )
}
