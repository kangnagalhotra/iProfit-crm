import { useEffect, useRef, useState } from 'react';
import { downloadCsv, downloadExcel } from '../utils/exportData';
import { useToast } from '../context/ToastContext';

export interface ExportColumn<T> {
  label: string;
  get: (item: T) => string;
}

export function ExportMenu<T>({
  columns, getCurrentView, getAll, getSelected, entityName, selectedCount,
}: {
  columns: ExportColumn<T>[];
  getCurrentView: () => T[];
  getAll: () => Promise<T[]>;
  getSelected: () => T[];
  entityName: string;
  selectedCount: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function run(format: 'csv' | 'excel', scope: 'view' | 'all' | 'selected') {
    setOpen(false);
    setExporting(true);
    try {
      const items = scope === 'view' ? getCurrentView() : scope === 'selected' ? getSelected() : await getAll();
      if (items.length === 0) { toast.error('Nothing to export'); return; }
      const headers = columns.map((c) => c.label);
      const rows = items.map((item) => columns.map((c) => c.get(item)));
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `${entityName.toLowerCase()}-${scope}-${stamp}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      if (format === 'csv') downloadCsv(filename, headers, rows);
      else downloadExcel(filename, headers, rows);
      toast.success(`Exported ${items.length} ${entityName}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button className="btn secondary" onClick={() => setOpen((o) => !o)} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export ▾'}
      </button>
      {open && (
        <div className="dropdown-menu" style={{ minWidth: 220 }}>
          <button onClick={() => run('csv', 'view')}>CSV — Current view</button>
          <button onClick={() => run('csv', 'all')}>CSV — All records</button>
          <button onClick={() => run('csv', 'selected')} disabled={selectedCount === 0}>CSV — Selected ({selectedCount})</button>
          <button onClick={() => run('excel', 'view')}>Excel — Current view</button>
          <button onClick={() => run('excel', 'all')}>Excel — All records</button>
          <button onClick={() => run('excel', 'selected')} disabled={selectedCount === 0}>Excel — Selected ({selectedCount})</button>
        </div>
      )}
    </div>
  );
}
