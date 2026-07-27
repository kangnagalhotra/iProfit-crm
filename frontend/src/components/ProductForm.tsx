import { useState } from 'react';
import type { Product } from '../api/types';
import { createProduct, updateProduct } from '../api/products';
import { SelectWithOther } from './SelectWithOther';
import { PRODUCT_SERVICE_OPTIONS, PRODUCT_SERVICE_OTHER } from '../utils/productServiceOptions';

export function ProductForm({
  product, onClose, onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const isEdit = !!product;
  // A recognized preset pre-selects that option; any other existing text
  // (legacy free-text category values predating this field) pre-fills the
  // Other box instead of being silently dropped — same resolution as
  // Department/Lost-reason's SelectWithOther fields elsewhere in the app.
  const knownService = !!product?.category && PRODUCT_SERVICE_OPTIONS.some((s) => s.value === product.category);
  const [form, setForm] = useState({
    name: product?.name ?? '',
    unitPrice: product?.unitPrice ?? '',
    service: product?.category ? (knownService ? product.category : PRODUCT_SERVICE_OTHER) : '',
    serviceOther: product?.category && !knownService ? product.category : '',
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
      const payload = {
        name: form.name,
        unitPrice: form.unitPrice,
        category: form.service ? (form.service === PRODUCT_SERVICE_OTHER ? form.serviceOther.trim() : form.service) : undefined,
      };
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
        <div className="field"><label>Services</label>
          <SelectWithOther
            options={PRODUCT_SERVICE_OPTIONS}
            value={form.service}
            onChange={(v) => set('service', v)}
            otherValue={form.serviceOther}
            onOtherChange={(v) => set('serviceOther', v)}
            otherTriggerValue={PRODUCT_SERVICE_OTHER}
            emptyLabel="Select service"
          />
        </div>
        <div className="field"><label>Unit price</label>
          <input type="number" min="0" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="0.00" /></div>
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
