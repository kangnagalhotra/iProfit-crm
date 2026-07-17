import { useEffect, useState } from 'react';
import type { ChecklistItem } from '../api/types';
import {
  listChecklistItems, addChecklistItem, toggleChecklistItem, deleteChecklistItem, reorderChecklistItems,
} from '../api/taskChecklist';
import { Icon } from './Icon';

// Sub-tasks (checklist-style) editor for a saved Task — add/toggle/remove/
// reorder items, each independently markable done, with a rollup "2/4
// done" count + progress bar. Items don't have their own assignee/due
// date; they're pure sub-checks under this task's owner/due date (see
// phase-o SQL patch). Deliberately its own "checklist-*" class namespace
// rather than the shared ".field" wrapper — ".field input { width: 100% }"
// was stretching the checkbox itself and shoving the row's layout sideways.
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
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="checklist-editor">
      <div className="checklist-editor-label">
        Sub-tasks{items.length > 0 ? ` (${done}/${items.length} done)` : ''}
      </div>
      {items.length > 0 && (
        <div className="checklist-progress-bar">
          <div className="checklist-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {items.length > 0 && (
        <div className="checklist-items">
          {items.map((item, i) => (
            <div key={item.id} className="checklist-item">
              <input type="checkbox" className="checklist-checkbox" checked={item.isDone} onChange={() => toggle(item)} />
              <span className={`checklist-item-title${item.isDone ? ' done' : ''}`}>{item.title}</span>
              <div className="checklist-item-actions">
                <button type="button" className="checklist-move-btn" onClick={() => move(item, -1)} disabled={i === 0} title="Move up">
                  <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevronDown" size={12} /></span>
                </button>
                <button type="button" className="checklist-move-btn" onClick={() => move(item, 1)} disabled={i === items.length - 1} title="Move down">
                  <Icon name="chevronDown" size={12} />
                </button>
                <button type="button" className="checklist-move-btn" onClick={() => remove(item)} aria-label="Remove sub-task" title="Remove">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="checklist-add-row">
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
