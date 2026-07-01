import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../api/client';
import type { AccountStatus, ImportAccountsResult } from '../api/types';

const HEADER_MAP: Record<string, string> = {
  name: 'name',
  domain: 'domain',
  industry: 'industry',
  city: 'city',
  state: 'state',
  country: 'country',
  status: 'status',
};

const STATUS_MAP: Record<string, AccountStatus> = {
  prospect: 'PROSPECT',
  'active customer': 'ACTIVE_CUSTOMER',
  active_customer: 'ACTIVE_CUSTOMER',
  active: 'ACTIVE_CUSTOMER',
  'on hold': 'ON_HOLD',
  on_hold: 'ON_HOLD',
  churned: 'CHURNED',
};

interface PreviewRow {
  name?: string;
  domain?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: AccountStatus;
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
    return { ...mapped, valid: false, reason: 'Missing company name' };
  }
  let status: AccountStatus | undefined;
  if (mapped.status) status = STATUS_MAP[mapped.status.toLowerCase()];
  return {
    name: mapped.name,
    domain: mapped.domain,
    industry: mapped.industry,
    city: mapped.city,
    state: mapped.state,
    country: mapped.country,
    status,
    valid: true,
  };
}

export function CompanyImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportAccountsResult | null>(null);

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
      const { data } = await api.post<ImportAccountsResult>('/accounts/import', {
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
        <h3 style={{ marginTop: 0 }}>Import companies from CSV</h3>

        {!result && (
          <>
            <div className="field">
              <label>CSV file (Name, Domain, Industry, City, State, Country, Status)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

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
                      <tr><th>Name</th><th>Domain</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={r.valid ? undefined : { opacity: 0.5 }}>
                          <td>{r.name ?? '—'}{!r.valid && <span className="error" style={{ margin: 0 }}> {r.reason}</span>}</td>
                          <td>{r.domain ?? '—'}</td>
                          <td>{r.status ?? 'PROSPECT'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn" onClick={submit} disabled={importing || validRows.length === 0}>
                {importing ? 'Importing…' : `Import ${validRows.length} compan${validRows.length === 1 ? 'y' : 'ies'}`}
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
                  <thead><tr><th>Row</th><th>Domain</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row}><td>{e.row}</td><td>{e.domain ?? '—'}</td><td>{e.message}</td></tr>
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
