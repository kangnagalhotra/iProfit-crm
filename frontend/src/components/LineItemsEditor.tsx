import type { LineItem, Product } from '../api/types';
import { Icon } from './Icon';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';

export interface LineItemsEditorProps {
  value: LineItem[];
  onChange: (value: LineItem[]) => void;
  // Optional single product catalog — picking one auto-fills name/price;
  // free text is still allowed (allowCustom) for ad hoc, uncataloged items.
  products?: Product[];
}

function lineTotal(r: LineItem) {
  return (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
}

export function LineItemsEditor({ value, onChange, products = [] }: LineItemsEditorProps) {
  const productOptions: SearchSelectOption[] = products.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku }));

  function updateRow(id: string, patch: Partial<LineItem>) {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...value, { id: crypto.randomUUID(), productName: '', quantity: '1', unitPrice: '' }]);
  }
  function removeRow(id: string) {
    onChange(value.filter((r) => r.id !== id));
  }
  function pickProduct(rowId: string, v: string) {
    const product = products.find((p) => p.id === v);
    if (product) {
      updateRow(rowId, { productId: product.id, productName: product.name, unitPrice: product.unitPrice });
    } else {
      updateRow(rowId, { productId: undefined, productName: v });
    }
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
          {productOptions.length > 0 ? (
            <SearchSelect
              options={productOptions}
              value={row.productId ?? row.productName}
              onChange={(v) => pickProduct(row.id, v)}
              allowCustom
              placeholder="Product name"
            />
          ) : (
            <input value={row.productName} onChange={(e) => updateRow(row.id, { productName: e.target.value })} placeholder="Product name" />
          )}
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
