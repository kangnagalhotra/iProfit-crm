import { useRef } from 'react';
import { Icon } from './Icon';

export type PendingOrUploadedFile =
  | { kind: 'pending'; localId: string; file: File }
  | { kind: 'uploaded'; id: string; fileName: string; fileSize: number };

export interface FileUploadListProps {
  parentId?: string;
  value: PendingOrUploadedFile[];
  onChange: (updater: PendingOrUploadedFile[] | ((prev: PendingOrUploadedFile[]) => PendingOrUploadedFile[])) => void;
  uploadFn: (parentId: string, file: File) => Promise<{ id: string; fileName: string; fileSize: number }>;
  deleteFn: (id: string) => Promise<void>;
  accept?: string;
}

export function FileUploadList({
  parentId, value, onChange, uploadFn, deleteFn, accept = '.pdf,.doc,.docx,.xls,.xlsx,image/*',
}: FileUploadListProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (!parentId) {
      onChange((prev) => [...prev, ...files.map((file) => ({ kind: 'pending' as const, localId: crypto.randomUUID(), file }))]);
      return;
    }
    for (const file of files) {
      const localId = crypto.randomUUID();
      onChange((prev) => [...prev, { kind: 'pending', localId, file }]);
      try {
        const uploaded = await uploadFn(parentId, file);
        onChange((prev) => prev.map((f) => (f.kind === 'pending' && f.localId === localId
          ? { kind: 'uploaded', id: uploaded.id, fileName: uploaded.fileName, fileSize: uploaded.fileSize }
          : f)));
      } catch {
        onChange((prev) => prev.filter((f) => !(f.kind === 'pending' && f.localId === localId)));
      }
    }
  }

  async function handleDelete(item: PendingOrUploadedFile) {
    if (item.kind === 'uploaded') await deleteFn(item.id);
    onChange((prev) => prev.filter((f) => f !== item));
  }

  return (
    <div className="file-upload-list">
      <button type="button" className="btn secondary btn-icon" onClick={() => inputRef.current?.click()}>
        <Icon name="plus" size={14} /> Add files
      </button>
      <input ref={inputRef} type="file" multiple accept={accept} hidden onChange={(e) => handleFiles(e.target.files)} />
      {value.map((item) => (
        <div className="file-upload-row" key={item.kind === 'pending' ? item.localId : item.id}>
          <span className="file-upload-name">{item.kind === 'pending' ? item.file.name : item.fileName}</span>
          {item.kind === 'pending' ? (
            <span className="file-upload-size">Uploading…</span>
          ) : (
            <span className="file-upload-size">{(item.fileSize / 1024).toFixed(0)} KB</span>
          )}
          <button type="button" className="row-remove-btn" onClick={() => handleDelete(item)} aria-label="Remove file">
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
