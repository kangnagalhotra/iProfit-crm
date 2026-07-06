import { useRef, useState } from 'react';
import type { Stage } from '../../api/types';
import type { StageTable } from '../../api/stages';
import { updateStage, deleteStage as deleteStageRow, reorderStages } from '../../api/stages';
import { STAGE_COLORS } from '../../constants/stageColors';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

export function StageColumnHeader<T extends Stage>({
  stage, count, editable, table, allStageIds, myIndex, onChanged, onDeleted, onReordered, subtitle,
}: {
  stage: T;
  count: number;
  editable: boolean;
  table?: StageTable;
  allStageIds: string[];
  myIndex: number;
  onChanged: (stage: T) => void;
  onDeleted: (stageId: string) => void;
  onReordered: (stages: T[]) => void;
  subtitle?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(stage.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  if (!editable) {
    return (
      <div className="stage-header">
        <div className="stage-header-row">
          <span className="stage-pill" style={{ background: stage.color }}>{stage.name}</span>
          <span className="count">{count}</span>
        </div>
        {subtitle && <div className="stage-subtitle">{subtitle}</div>}
      </div>
    );
  }

  const stageTable = table!;

  async function saveName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === stage.name) { setName(stage.name); return; }
    try {
      const data = await updateStage(stageTable, stage.id, { name: trimmed });
      onChanged(data as T);
    } catch (e: any) {
      setName(stage.name);
      toast.error(e.message ?? 'Could not rename stage');
    }
  }

  async function saveColor(color: string) {
    try {
      const data = await updateStage(stageTable, stage.id, { color });
      onChanged(data as T);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update color');
    }
  }

  async function deleteStage() {
    setMenuOpen(false);
    const ok = await confirm(`Delete the "${stage.name}" stage? This cannot be undone.`, { title: 'Delete stage' });
    if (!ok) return;
    try {
      await deleteStageRow(stageTable, stage.id);
      onDeleted(stage.id);
      toast.success(`Deleted "${stage.name}"`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete stage');
    }
  }

  async function move(direction: -1 | 1) {
    setMenuOpen(false);
    const newIndex = myIndex + direction;
    if (newIndex < 0 || newIndex >= allStageIds.length) return;
    const reordered = [...allStageIds];
    [reordered[myIndex], reordered[newIndex]] = [reordered[newIndex], reordered[myIndex]];
    try {
      const data = await reorderStages(stageTable, reordered);
      onReordered(data as T[]);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not reorder stages');
    }
  }

  return (
    <div className="stage-header">
      <div className="stage-header-row">
        <div className="dropdown-wrap" ref={colorMenuRef}>
          <button
            type="button"
            className="color-swatch-btn"
            style={{ background: stage.color }}
            title="Stage color"
            onClick={() => setColorMenuOpen((o) => !o)}
          />
          {colorMenuOpen && (
            <div className="dropdown-menu color-swatch-menu" onMouseLeave={() => setColorMenuOpen(false)}>
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`color-swatch-option${c.value === stage.color ? ' selected' : ''}`}
                  style={{ background: c.value }}
                  title={c.name}
                  onClick={() => { saveColor(c.value); setColorMenuOpen(false); }}
                />
              ))}
            </div>
          )}
        </div>
        {editingName ? (
          <input
            type="text"
            value={name}
            autoFocus
            style={{ flex: 1 }}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        ) : (
          <span className="stage-pill" style={{ background: stage.color, cursor: 'text' }} onClick={() => setEditingName(true)}>
            {stage.name}
          </span>
        )}
        <span className="count">{count}</span>
        <div className="dropdown-wrap" ref={menuRef}>
          <button className="stage-menu-btn" onClick={() => setMenuOpen((o) => !o)}>⋯</button>
          {menuOpen && (
            <div className="dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
              {myIndex > 0 && <button onClick={() => move(-1)}>← Move left</button>}
              {myIndex < allStageIds.length - 1 && <button onClick={() => move(1)}>Move right →</button>}
              <button onClick={deleteStage}>Delete stage</button>
            </div>
          )}
        </div>
      </div>
      {subtitle && <div className="stage-subtitle">{subtitle}</div>}
    </div>
  );
}
