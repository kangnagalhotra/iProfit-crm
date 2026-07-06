import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../api/client';
import { downloadExcelTemplate } from '../utils/excelTemplate';

const TEMPLATE_HEADERS = ['Task Name', 'Type', 'Priority', 'Due Date', 'Status', 'Related Module', 'Related Record'];
const TEMPLATE_SAMPLE = ['Follow up call', 'CALL', 'HIGH', '2026-09-01', 'Not Started', 'Deal', 'Acme Renewal'];

const HEADER_MAP: Record<string, string> = {
  'task name': 'title',
  name: 'title',
  title: 'title',
  type: 'type',
  priority: 'priority',
  'due date': 'dueAt',
  duedate: 'dueAt',
  status: 'statusName',
  'related module': 'relatedModule',
  'related record': 'relatedRecordName',
};

interface PreviewRow {
  title?: string;
  type?: string;
  priority?: string;
  dueAt?: string;
  statusName?: string;
  relatedModule?: string;
  relatedRecordName?: string;
  valid: boolean;
  reason?: string;
}

interface ImportResult {
  created: any[];
  errors: { row: number; title?: string; message: string }[];
  summary: { total: number; createdCount: number; errorCount: number };
}

function mapRow(raw: Record<string, string>): PreviewRow {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_MAP[header];
    if (field && value?.trim()) mapped[field] = value.trim();
  }
  if (mapped.relatedModule) mapped.relatedModule = mapped.relatedModule.toLowerCase().replace('company', 'account').replace('deal', 'opportunity');
  if (!mapped.title) return { ...mapped, valid: false, reason: 'Missing task name' };
  if (!mapped.dueAt) return { ...mapped, valid: false, reason: 'Missing due date' };
  return {
    title: mapped.title,
    type: mapped.type,
    priority: mapped.priority,
    dueAt: mapped.dueAt,
    statusName: mapped.statusName,
    relatedModule: mapped.relatedModule,
    relatedRecordName: mapped.relatedRecordName,
    valid: true,
  };
}

export function TaskImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setParseError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
      });
      if (parsed.errors.length > 0) {
        setParseError(parsed.errors[0].message);
        setRows([]);
        return;
      }
      setRows(parsed.data.map(mapRow));
    };
    reader.readAsText(file);
  }

  const validRows = rows.filter((r) => r.valid);
  const invalidCount = rows.length - validRows.length;

  async function submit() {
    setImporting(true);
    try {
      const { data } = await api.post<ImportResult>('/tasks/import', {
        rows: validRows.map(({ valid: _v, reason: _r, ...row }) => row),
      });
      setResult(data);
    } catch (e: any) {
      setParseError(e.response?.data?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Import tasks from CSV</h3>

        {!result && (
          <>
            <div className="field">
              <label>CSV file (Task Name, Type, Priority, Due Date, Status, Related Module, Related Record)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            <button
              className="btn secondary"
              style={{ marginBottom: 14 }}
              onClick={() => downloadExcelTemplate('tasks-import-template.xlsx', TEMPLATE_HEADERS, TEMPLATE_SAMPLE)}
            >
              ⬇ Download Excel template
            </button>

            {parseError && <div className="error">{parseError}</div>}

            {fileName && !parseError && (
              <>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {rows.length} row(s) found — {validRows.length} ready to import
                  {invalidCount > 0 && `, ${invalidCount} skipped (missing required field)`}.
                </p>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Due Date</th><th>Status</th><th>Related</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={r.valid ? undefined : { opacity: 0.5 }}>
                          <td>{r.title ?? '—'}{!r.valid && <span className="error" style={{ margin: 0 }}> {r.reason}</span>}</td>
                          <td>{r.dueAt ?? '—'}</td>
                          <td>{r.statusName ?? 'Default'}</td>
                          <td>{r.relatedRecordName ? `${r.relatedRecordName} (${r.relatedModule})` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={submit} disabled={importing || validRows.length === 0}>
                {importing ? 'Importing…' : `Import ${validRows.length} task(s)`}
              </button>
              <button className="btn secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {result && (
          <>
            <p>
              <strong>{result.summary.createdCount}</strong> created, <strong>{result.summary.errorCount}</strong> failed
              {invalidCount > 0 && `, ${invalidCount} skipped before import`}.
            </p>
            {result.errors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                <table>
                  <thead><tr><th>Row</th><th>Name</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row}><td>{e.row}</td><td>{e.title ?? '—'}</td><td>{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={onImported}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
