import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BracketView from '../BracketView'
import type { KnockoutMatchup } from '@/types'

const makeMatchup = (
  round: number,
  matchupIndex: number,
  teamA: string | null,
  teamB: string | null,
  groupSourceA?: string,
  groupSourceB?: string,
): KnockoutMatchup => ({
  id: `m-${round}-${matchupIndex}`,
  pool_id: 'pool-1',
  round,
  matchup_index: matchupIndex,
  team_a: teamA,
  team_b: teamB,
  group_source_a: groupSourceA ?? null,
  group_source_b: groupSourceB ?? null,
})

describe('BracketView', () => {
  it('renders round names for 4-team bracket', () => {
    const matchups = [
      makeMatchup(1, 0, 'A', 'B'),
      makeMatchup(1, 1, 'C', 'D'),
      makeMatchup(2, 0, null, null),
    ]
    render(<BracketView matchups={matchups} teamCount={4} />)
    expect(screen.getByText('Semi-Finals')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('renders team names in matchups', () => {
    const matchups = [
      makeMatchup(1, 0, 'Argentina', 'France'),
      makeMatchup(1, 1, 'Brazil', 'Germany'),
    ]
    render(<BracketView matchups={matchups} teamCount={4} />)
    expect(screen.getByText('Argentina')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()
    expect(screen.getByText('Brazil')).toBeInTheDocument()
    expect(screen.getByText('Germany')).toBeInTheDocument()
  })

  it('shows TBD for null teams', () => {
    const matchups = [makeMatchup(1, 0, null, null)]
    render(<BracketView matchups={matchups} teamCount={2} />)
    const tbdElements = screen.getAllByText('TBD')
    expect(tbdElements.length).toBe(2)
  })

  it('shows group source labels when teams are null', () => {
    const matchups = [makeMatchup(1, 0, null, null, 'A1', 'B2')]
    render(<BracketView matchups={matchups} teamCount={2} />)
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('B2')).toBeInTheDocument()
  })

  it('highlights result winner in bold', () => {
    const matchups = [makeMatchup(1, 0, 'A', 'B')]
    const results = [
      { id: 'r1', pool_id: 'p1', round: 1, matchup_index: 0, winning_team: 'A', entered_by: 'u1', entered_at: '' },
    ]
    render(<BracketView matchups={matchups} teamCount={2} results={results} />)
    // The winner badge should appear
    expect(screen.getByText('A', { selector: '.text-xs' })).toBeInTheDocument()
  })

  it('shows "Your pick" badge for user picks', () => {
    const matchups = [makeMatchup(1, 0, 'A', 'B')]
    const userPicks = [{ round: 1, matchup_index: 0, picked_team: 'B' }]
    render(<BracketView matchups={matchups} teamCount={2} userPicks={userPicks} />)
    expect(screen.getByText('Your pick')).toBeInTheDocument()
  })

  it('renders message for insufficient teams', () => {
    render(<BracketView matchups={[]} teamCount={1} />)
    expect(screen.getByText('Not enough teams for a bracket.')).toBeInTheDocument()
  })
})
