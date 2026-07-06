import { useState } from 'react';
import Papa from 'papaparse';
import { bulkImport } from '../api/bulkImport';
import type { ImportOpportunitiesResult } from '../api/types';
import { downloadExcelTemplate } from '../utils/excelTemplate';

const TEMPLATE_HEADERS = ['Name', 'Value', 'Company', 'Stage', 'Closing Date'];
const TEMPLATE_SAMPLE = ['Acme Renewal', '15000', 'Acme Corp', 'Lead', '2026-09-01'];

const HEADER_MAP: Record<string, string> = {
  name: 'name',
  'deal name': 'name',
  value: 'amount',
  amount: 'amount',
  company: 'companyName',
  'company name': 'companyName',
  stage: 'stageName',
  'closing date': 'closeDate',
  closedate: 'closeDate',
};

interface PreviewRow {
  name?: string;
  amount?: string;
  companyName?: string;
  stageName?: string;
  closeDate?: string;
  valid: boolean;
  reason?: string;
}

function mapRow(raw: Record<string, string>): PreviewRow {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_MAP[header];
    if (field && value?.trim()) mapped[field] = value.trim();
  }
  if (!mapped.name) {
    return { ...mapped, valid: false, reason: 'Missing deal name' };
  }
  return {
    name: mapped.name,
    amount: mapped.amount,
    companyName: mapped.companyName,
    stageName: mapped.stageName,
    closeDate: mapped.closeDate,
    valid: true,
  };
}

export function DealImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportOpportunitiesResult | null>(null);

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
      const data = await bulkImport<ImportOpportunitiesResult['errors'][number]>(
        'deals',
        validRows.map(({ valid: _v, reason: _r, ...row }) => row),
      );
      setResult(data as ImportOpportunitiesResult);
    } catch (e: any) {
      setParseError(e.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Import deals from CSV</h3>

        {!result && (
          <>
            <div className="field">
              <label>CSV file (Name, Value, Company, Stage, Closing Date)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            <button
              className="btn secondary"
              style={{ marginBottom: 14 }}
              onClick={() => downloadExcelTemplate('deals-import-template.xlsx', TEMPLATE_HEADERS, TEMPLATE_SAMPLE)}
            >
              ⬇ Download Excel template
            </button>

            {parseError && <div className="error">{parseError}</div>}

            {fileName && !parseError && (
              <>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {rows.length} row(s) found — {validRows.length} ready to import
                  {invalidCount > 0 && `, ${invalidCount} skipped (missing name)`}.
                </p>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Value</th><th>Company</th><th>Stage</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={r.valid ? undefined : { opacity: 0.5 }}>
                          <td>{r.name ?? '—'}{!r.valid && <span className="error" style={{ margin: 0 }}> {r.reason}</span>}</td>
                          <td>{r.amount ?? '—'}</td>
                          <td>{r.companyName ?? '—'}</td>
                          <td>{r.stageName ?? 'Default'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={submit} disabled={importing || validRows.length === 0}>
                {importing ? 'Importing…' : `Import ${validRows.length} deal(s)`}
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
                      <tr key={e.row}><td>{e.row}</td><td>{e.name ?? '—'}</td><td>{e.message}</td></tr>
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
