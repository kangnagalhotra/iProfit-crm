import { useState } from 'react';
import Papa from 'papaparse';
import { bulkImport } from '../api/bulkImport';
import type { ImportLeadsResult } from '../api/types';
import { downloadExcelTemplate } from '../utils/excelTemplate';
import { isValidEmail, stripPhoneDigits, isValidPhone } from '../utils/validation';

const TEMPLATE_HEADERS = ['First Name', 'Last Name', 'Email', 'Mobile Number', 'Job Title', 'Stage'];
const TEMPLATE_SAMPLE = ['Jane', 'Doe', 'jane.doe@example.com', '9876543210', 'Sales Manager', 'New'];

const HEADER_MAP: Record<string, string> = {
  'first name': 'firstName',
  firstname: 'firstName',
  'last name': 'lastName',
  lastname: 'lastName',
  email: 'email',
  mobile: 'mobile',
  'mobile number': 'mobile',
  phone: 'mobile',
  'phone number': 'mobile',
  'job title': 'jobTitle',
  jobtitle: 'jobTitle',
  status: 'stageName',
  stage: 'stageName',
};

interface PreviewRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  jobTitle?: string;
  stageName?: string;
  valid: boolean;
  reason?: string;
}

function mapRow(raw: Record<string, string>): PreviewRow {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_MAP[header];
    if (field && value?.trim()) mapped[field] = value.trim();
  }
  if (mapped.mobile) mapped.mobile = stripPhoneDigits(mapped.mobile);
  if (mapped.email && !isValidEmail(mapped.email)) {
    return { ...mapped, valid: false, reason: 'Invalid email format' };
  }
  if (mapped.mobile && !isValidPhone(mapped.mobile)) {
    return { ...mapped, valid: false, reason: 'Invalid mobile number (must be 10 digits)' };
  }
  return {
    firstName: mapped.firstName,
    lastName: mapped.lastName,
    email: mapped.email,
    mobile: mapped.mobile,
    jobTitle: mapped.jobTitle,
    stageName: mapped.stageName,
    valid: true,
  };
}

export function LeadImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportLeadsResult | null>(null);

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
      const data = await bulkImport<ImportLeadsResult['errors'][number]>(
        'leads',
        validRows.map(({ valid: _v, reason: _r, ...row }) => row),
      );
      setResult(data as ImportLeadsResult);
    } catch (e: any) {
      setParseError(e.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Import leads from CSV</h3>

        {!result && (
          <>
            <div className="field">
              <label>CSV file (First Name, Last Name, Email, Mobile Number, Job Title, Stage)</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            <button
              className="btn secondary"
              style={{ marginBottom: 14 }}
              onClick={() => downloadExcelTemplate('leads-import-template.xlsx', TEMPLATE_HEADERS, TEMPLATE_SAMPLE)}
            >
              ⬇ Download Excel template
            </button>

            {parseError && <div className="error">{parseError}</div>}

            {fileName && !parseError && (
              <>
                <p style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {rows.length} row(s) found — {validRows.length} ready to import
                  {invalidCount > 0 && `, ${invalidCount} skipped (invalid email/mobile number)`}.
                </p>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Email</th><th>Stage</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={r.valid ? undefined : { opacity: 0.5 }}>
                          <td>{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
                          <td>{r.email ?? '—'}{!r.valid && <span className="error" style={{ margin: 0 }}> {r.reason}</span>}</td>
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
                {importing ? 'Importing…' : `Import ${validRows.length} lead(s)`}
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
                  <thead><tr><th>Row</th><th>Email</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row}><td>{e.row}</td><td>{e.email ?? '—'}</td><td>{e.message}</td></tr>
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
