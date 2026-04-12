import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Group as GroupType } from '@/types'

// ─── Sortable row ─────────────────────────────────────────────────────────────

interface SortableRowProps {
  team: string
  rank: number
  isAdvancing: boolean
  disabled: boolean
}

function SortableRow({ team, rank, isAdvancing, disabled }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        isAdvancing && 'bg-primary/10 dark:bg-primary/15',
        isDragging && 'rounded-md shadow-lg',
      )}
    >
      {/* Rank number */}
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{rank}</span>

      {/* Drag handle */}
      {!disabled && (
        <button
          type="button"
          className="touch-none cursor-grab text-muted-foreground/60 active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {disabled && <span className="w-4" />}

      {/* Team name */}
      <span
        className={cn(
          'flex-1 truncate text-sm',
          isAdvancing && 'font-medium',
        )}
      >
        {team}
      </span>

      {/* Advances badge */}
      {isAdvancing && (
        <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
          Advances
        </span>
      )}
    </div>
  )
}

// ─── GroupRankingTable ────────────────────────────────────────────────────────

interface GroupRankingTableProps {
  group: GroupType
  advanceCount: number
  /** Full ordered list of teams, top = best predicted position */
  ranking: string[]
  onRankingChange?: (newRanking: string[]) => void
  disabled?: boolean
}

export default function GroupRankingTable({
  group,
  advanceCount,
  ranking,
  onRankingChange,
  disabled = false,
}: GroupRankingTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ranking.indexOf(active.id as string)
    const newIndex = ranking.indexOf(over.id as string)
    onRankingChange?.(arrayMove(ranking, oldIndex, newIndex))
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {/* Header */}
      <div className="border-b border-border bg-muted/50 px-3 py-2">
        <h4 className="text-sm font-semibold">{group.name}</h4>
        {!disabled && (
          <p className="text-xs text-muted-foreground">
            Drag to rank · top {advanceCount} advance
          </p>
        )}
      </div>

      {/* Rows */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
          <div className="divide-y divide-border">
            {ranking.map((team, i) => {
              const isAdvanceCutoff = i === advanceCount - 1 && i < ranking.length - 1

            return (
              <div key={team}>
                  <SortableRow
                    team={team}
                    rank={i + 1}
                    isAdvancing={i < advanceCount}
                    disabled={disabled}
                  />
                  {/* Advance / eliminated divider after last advancing position */}
                  {isAdvanceCutoff && (
                    <div className="relative flex items-center">
                      <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                      <span className="shrink-0 bg-background px-2 text-xs text-muted-foreground">
                        eliminated below
                      </span>
                      <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
