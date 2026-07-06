import { downloadExcel } from './exportData';

export function downloadExcelTemplate(filename: string, headers: string[], sampleRow?: string[]) {
  downloadExcel(filename, headers, sampleRow ? [sampleRow] : []);
}
