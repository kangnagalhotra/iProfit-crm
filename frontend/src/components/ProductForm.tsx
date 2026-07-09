import { useState } from 'react';
import type { Product, ProductSector } from '../api/types';
import { createProduct, updateProduct } from '../api/products';

const SECTORS: { value: ProductSector; label: string }[] = [
  { value: 'BOTH', label: 'Private + Government' },
  { value: 'PRIVATE', label: 'Private Sector' },
  { value: 'GOVERNMENT', label: 'Government Sector' },
];

export function ProductForm({
  product, onClose, onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    category: product?.category ?? '',
    sector: product?.sector ?? 'BOTH' as ProductSector,
    unitPrice: product?.unitPrice ?? '',
    description: product?.description ?? '',
    isActive: product?.isActive ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError('');
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    if (Number(form.unitPrice) < 0) { setError('Price cannot be negative.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, sku: form.sku || undefined, category: form.category || undefined, description: form.description || undefined };
      const data = isEdit ? await updateProduct(product!.id, payload) : await createProduct(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit product' : 'Add product'}</h3>
        <div className="field"><label>Product name*</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label>SKU</label>
          <input value={form.sku} onChange={(e) => set('sku', e.target.value)} /></div>
        <div className="field"><label>Category</label>
          <input value={form.category} onChange={(e) => set('category', e.target.value)} /></div>
        <div className="field"><label>Sector</label>
          <select value={form.sector} onChange={(e) => set('sector', e.target.value as ProductSector)}>
            {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="helper-text">One catalog — sector just drives filtering/reporting, not a separate product list.</div>
        </div>
        <div className="field"><label>Unit price</label>
          <input type="number" min="0" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0.00" /></div>
        <div className="field"><label>Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active (shown when picking products on a deal)
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
