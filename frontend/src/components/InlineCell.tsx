import type { ReactNode } from 'react';

// Table-cell version of the EditableRow pattern: shows plain display content with
// a pencil icon that only appears on hover, so board tables don't look cluttered
// with permanently-boxed <select> controls. Clicking the cell (or the pencil)
// swaps in the caller's own editor (children); business logic stays with the caller.
export function InlineCell({
  display, editing, onStartEdit, children,
}: {
  display: ReactNode;
  editing: boolean;
  onStartEdit: () => void;
  children: ReactNode;
}) {
  if (editing) return <>{children}</>;
  return (
    <span className="inline-cell" onClick={onStartEdit}>
      {display}
      <button
        type="button"
        className="edit-icon"
        onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        title="Edit"
      >✎
      </button>
    </span>
  );
}
