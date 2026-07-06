import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

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
  renderColumnHeader?: (column: KanbanColumn<T>) => ReactNode;
  renderColumnActions?: (column: KanbanColumn<T>) => ReactNode;
  emptyState?: (column: KanbanColumn<T>) => ReactNode;
  extraColumn?: ReactNode;
}

function DroppableColumn({
  id, header, actions, children,
}: { id: string; header: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className={`kanban-col${isOver ? ' drag-over' : ''}`}>
      <div className="kanban-col-fixed">
        {header}
        {actions}
      </div>
      <div ref={setNodeRef} className="kanban-col-cards">
        {children}
      </div>
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes, listeners, setNodeRef, isDragging,
  } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`kanban-card${isDragging ? ' dragging' : ''}`}
    >
      {children}
    </div>
  );
}

// Generic, board-agnostic kanban — column/card shape and drop handling are
// supplied by the caller so Leads and Companies can share this.
export function Kanban<T>({
  columns, getId, renderCard, onDrop, renderColumnHeader, renderColumnActions, emptyState, extraColumn,
}: KanbanProps<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumn = columns.find((c) => c.items.some((it) => getId(it) === itemId));
    if (!fromColumn || fromColumn.id === toColumnId) return;
    onDrop(itemId, fromColumn.id, toColumnId);
  }

  const activeItem = activeId
    ? columns.flatMap((c) => c.items).find((it) => getId(it) === activeId) ?? null
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="kanban">
        {columns.map((col) => (
          <DroppableColumn
            key={col.id}
            id={col.id}
            header={renderColumnHeader ? renderColumnHeader(col) : (
              <h4>{col.label} <span className="count">({col.items.length})</span></h4>
            )}
            actions={renderColumnActions?.(col)}
          >
            {col.items.length === 0 ? (
              emptyState ? emptyState(col) : <p className="kanban-empty-text">No records</p>
            ) : (
              col.items.map((item) => (
                <DraggableCard key={getId(item)} id={getId(item)}>
                  {renderCard(item)}
                </DraggableCard>
              ))
            )}
          </DroppableColumn>
        ))}
        {extraColumn}
      </div>
      <DragOverlay>
        {activeItem ? <div className="kanban-card kanban-card-overlay">{renderCard(activeItem)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
