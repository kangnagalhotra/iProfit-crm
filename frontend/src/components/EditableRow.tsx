import type { ReactNode } from 'react';

// A shared visual shell only — no PATCH/business logic. Each detail page keeps
// its own `editingField` state and decides what onStartEdit does (open an inline
// editor via `children`, or open the full Edit Details modal for plain fields).
export function EditableRow({
  label, value, emptyLabel, editing, onStartEdit, children, editable = true,
}: {
  label: string;
  value: ReactNode;
  emptyLabel?: string;
  editing: boolean;
  onStartEdit: () => void;
  children?: ReactNode;
  editable?: boolean;
}) {
  const isEmpty = value === undefined || value === null || value === '';
  return (
    <div className="row editable-row">
      <div className="label">{label}</div>
      <div className="value">
        {editing ? (
          <div className="editable-row-editor">{children}</div>
        ) : isEmpty ? (
          editable ? (
            <button type="button" className="add-value" onClick={onStartEdit}>+ Add {emptyLabel ?? label}</button>
          ) : <span className="value-empty">Not provided</span>
        ) : (
          <span className="editable-row-display">
            {value}
            {editable && (
              <button type="button" className="edit-icon" onClick={onStartEdit} title={`Edit ${label}`}>✎</button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
