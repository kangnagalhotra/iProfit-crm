import type { ReactNode } from 'react';
import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';

export interface KanbanColumn<T> {
  id: string;
  label: string;
  items: T[];
}

interface KanbanProps<T> {
  columns: KanbanColumn<T>[];
  getId: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onDrop: (itemId: string, fromColumnId: string, toColumnId: string) => void;
}

function DroppableColumn({ id, label, count, children }: { id: string; label: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`kanban-col${isOver ? ' drag-over' : ''}`}>
      <h4>{label} <span className="count">({count})</span></h4>
      {children}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes, listeners, setNodeRef, transform, isDragging,
  } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`kanban-card${isDragging ? ' dragging' : ''}`}
    >
      {children}
    </div>
  );
}

// Generic, board-agnostic kanban — column/card shape and drop handling are
// supplied by the caller so Leads and (later) Companies can share this.
export function Kanban<T>({
  columns, getId, renderCard, onDrop,
}: KanbanProps<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumn = columns.find((c) => c.items.some((it) => getId(it) === itemId));
    if (!fromColumn || fromColumn.id === toColumnId) return;
    onDrop(itemId, fromColumn.id, toColumnId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="kanban">
        {columns.map((col) => (
          <DroppableColumn key={col.id} id={col.id} label={col.label} count={col.items.length}>
            {col.items.map((item) => (
              <DraggableCard key={getId(item)} id={getId(item)}>
                {renderCard(item)}
              </DraggableCard>
            ))}
          </DroppableColumn>
        ))}
      </div>
    </DndContext>
  );
}
