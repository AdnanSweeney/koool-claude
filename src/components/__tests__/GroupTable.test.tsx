import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GroupTable from '../GroupTable'
import type { Group } from '@/types'

describe('GroupTable', () => {
  const group: Group = {
    id: 'g1',
    pool_id: 'p1',
    name: 'Group A',
    teams: ['Brazil', 'Germany', 'Japan', 'Mexico'],
    advancing_teams: null,
  }

  it('renders group name', () => {
    render(<GroupTable group={group} />)
    expect(screen.getByText('Group A')).toBeInTheDocument()
  })

  it('renders all team names', () => {
    render(<GroupTable group={group} />)
    expect(screen.getByText('Brazil')).toBeInTheDocument()
    expect(screen.getByText('Germany')).toBeInTheDocument()
    expect(screen.getByText('Japan')).toBeInTheDocument()
    expect(screen.getByText('Mexico')).toBeInTheDocument()
  })

  it('shows "Advanced" badge for advancing teams', () => {
    const withAdvancing: Group = {
      ...group,
      advancing_teams: ['Brazil', 'Germany'],
    }
    render(<GroupTable group={withAdvancing} />)
    const badges = screen.getAllByText('Advanced')
    expect(badges).toHaveLength(2)
  })

  it('does not show "Advanced" badge when no teams have advanced', () => {
    render(<GroupTable group={group} />)
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
  })

  it('shows "Your pick" badge for user picks', () => {
    render(<GroupTable group={group} userAdvancingPicks={['Japan']} />)
    expect(screen.getByText('Your pick')).toBeInTheDocument()
  })

  it('shows both badges when team is picked and advanced', () => {
    const withAdvancing: Group = {
      ...group,
      advancing_teams: ['Brazil'],
    }
    render(<GroupTable group={withAdvancing} userAdvancingPicks={['Brazil']} />)
    expect(screen.getByText('Advanced')).toBeInTheDocument()
    expect(screen.getByText('Your pick')).toBeInTheDocument()
  })
})
