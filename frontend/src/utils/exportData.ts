import { utils, writeFile } from 'xlsx';

// Both helpers only ever write data we already fetched from our own API —
// never used to parse untrusted uploads, since the xlsx package's read path
// has known, unpatched ReDoS/prototype-pollution advisories (see excelTemplate.ts).

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename: string, headers: string[], rows: string[][]) {
  const sheet = utils.aoa_to_sheet([headers, ...rows]);
  // Size each column to its widest cell so values (dates especially) never render clipped.
  sheet['!cols'] = headers.map((header, i) => {
    const widest = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), header.length);
    return { wch: Math.min(40, widest + 2) };
  });
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Export');
  // bookSST forces a proper shared-strings table (cell type "s") instead of the
  // non-standard "str" (formula-result) type SheetJS otherwise falls back to —
  // real Excel silently blanks "str" cells that lack a backing formula, most
  // visibly on date-like values, even though this library's own reader tolerates it.
  writeFile(workbook, filename, { bookSST: true });
}
