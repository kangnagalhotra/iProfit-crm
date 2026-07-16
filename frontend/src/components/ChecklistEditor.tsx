import { useEffect, useState } from 'react';
import type { ChecklistItem } from '../api/types';
import {
  listChecklistItems, addChecklistItem, toggleChecklistItem, deleteChecklistItem, reorderChecklistItems,
} from '../api/taskChecklist';
import { Icon } from './Icon';

// Sub-tasks (checklist-style) editor for a saved Task — add/toggle/remove/
// reorder items, each independently markable done, with a rollup "2/4
// done" count. Items don't have their own assignee/due date; they're pure
// sub-checks under this task's owner/due date (see phase-o SQL patch).
export function ChecklistEditor({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listChecklistItems(taskId).then(setItems).finally(() => setLoading(false));
  }, [taskId]);

  async function add() {
    const title = newTitle.trim();
    if (!title) return;
    const item = await addChecklistItem(taskId, title);
    setItems((its) => [...its, item]);
    setNewTitle('');
  }

  async function toggle(item: ChecklistItem) {
    const updated = await toggleChecklistItem(item.id, !item.isDone);
    setItems((its) => its.map((i) => (i.id === item.id ? updated : i)));
  }

  async function remove(item: ChecklistItem) {
    await deleteChecklistItem(item.id);
    setItems((its) => its.filter((i) => i.id !== item.id));
  }

  async function move(item: ChecklistItem, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setItems(reordered);
    await reorderChecklistItems(reordered.map((i) => i.id));
  }

  if (loading) return null;
  const done = items.filter((i) => i.isDone).length;

  return (
    <div className="field">
      <label>Sub-tasks{items.length > 0 ? ` (${done}/${items.length} done)` : ''}</label>
      {items.map((item, i) => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        }}
        >
          <input type="checkbox" checked={item.isDone} onChange={() => toggle(item)} />
          <span style={{
            flex: 1,
            textDecoration: item.isDone ? 'line-through' : undefined,
            color: item.isDone ? 'var(--muted)' : undefined,
          }}
          >
            {item.title}
          </span>
          <button type="button" className="btn secondary btn-icon" onClick={() => move(item, -1)} disabled={i === 0} title="Move up">
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevronDown" size={12} /></span>
          </button>
          <button type="button" className="btn secondary btn-icon" onClick={() => move(item, 1)} disabled={i === items.length - 1} title="Move down">
            <Icon name="chevronDown" size={12} />
          </button>
          <button type="button" className="row-remove-btn" onClick={() => remove(item)} aria-label="Remove sub-task">
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a sub-task…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="btn secondary" onClick={add} disabled={!newTitle.trim()}>Add</button>
      </div>
    </div>
  );
}
