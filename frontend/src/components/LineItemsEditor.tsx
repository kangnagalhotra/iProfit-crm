import type { LineItem } from '../api/types';
import { Icon } from './Icon';

export interface LineItemsEditorProps {
  value: LineItem[];
  onChange: (value: LineItem[]) => void;
}

function lineTotal(r: LineItem) {
  return (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
}

export function LineItemsEditor({ value, onChange }: LineItemsEditorProps) {
  function updateRow(id: string, patch: Partial<LineItem>) {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...value, { id: crypto.randomUUID(), productName: '', quantity: '1', unitPrice: '' }]);
  }
  function removeRow(id: string) {
    onChange(value.filter((r) => r.id !== id));
  }

  return (
    <div className="line-items-editor">
      {value.length > 0 && (
        <div className="line-items-header-row">
          <span>Product</span><span>Qty</span><span>Unit price</span><span>Total</span><span />
        </div>
      )}
      {value.map((row) => (
        <div className="line-items-row" key={row.id}>
          <input value={row.productName} onChange={(e) => updateRow(row.id, { productName: e.target.value })} placeholder="Product name" />
          <input type="number" min="0" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} />
          <input type="number" min="0" value={row.unitPrice} onChange={(e) => updateRow(row.id, { unitPrice: e.target.value })} placeholder="0.00" />
          <span className="line-item-total">{lineTotal(row).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
          <button type="button" className="row-remove-btn" onClick={() => removeRow(row.id)} aria-label="Remove line item">
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn secondary btn-icon" onClick={addRow} style={{ marginTop: 8 }}>
        <Icon name="plus" size={14} /> Add row
      </button>
    </div>
  );
}
