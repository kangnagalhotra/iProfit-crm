import { useEffect, useState, useCallback } from 'react';
import type { Product, ProductSector } from '../api/types';
import { listProducts, deleteProduct } from '../api/products';
import { ProductForm } from '../components/ProductForm';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const SECTOR_LABELS: Record<ProductSector, string> = {
  BOTH: 'Private + Government', PRIVATE: 'Private Sector', GOVERNMENT: 'Government Sector',
};

function formatPrice(value: string) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function ProductsList() {
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState<ProductSector | ''>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState<{ product?: Product } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listProducts({ search: search || undefined, sector: sector || undefined, includeInactive })
      .then(setProducts)
      .finally(() => setLoading(false));
  }, [search, sector, includeInactive]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(product: Product) {
    const ok = await confirm(`Delete "${product.name}"? This cannot be undone.`, { title: 'Delete product' });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      toast.success('Product deleted');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete product');
    }
  }

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Products <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({products.length})</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Search name or SKU" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
          <select value={sector} onChange={(e) => setSector(e.target.value as ProductSector | '')}>
            <option value="">All sectors</option>
            <option value="PRIVATE">Private Sector</option>
            <option value="GOVERNMENT">Government Sector</option>
            <option value="BOTH">Private + Government</option>
          </select>
          <button className="btn" onClick={() => setFormState({})}>+ Add Product</button>
        </div>
      </div>

      <div className="quick-filter-chips">
        <button className={`chip-filter${includeInactive ? ' active' : ''}`} onClick={() => setIncludeInactive((v) => !v)}>
          Show inactive
        </button>
      </div>

      {loading ? <SkeletonTable columns={6} /> : products.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No products yet"
          description="Add your first product to the catalog."
          action={{ label: '+ Add product', onClick: () => setFormState({}) }}
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Sector</th>
              <th>Unit Price</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku ?? '—'}</td>
                <td>{p.category ?? '—'}</td>
                <td>{SECTOR_LABELS[p.sector]}</td>
                <td>{formatPrice(p.unitPrice)}</td>
                <td>{p.isActive ? 'Active' : 'Inactive'}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn secondary" onClick={() => setFormState({ product: p })}>Edit</button>
                  <button className="btn secondary" onClick={() => handleDelete(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formState && (
        <ProductForm
          product={formState.product}
          onClose={() => setFormState(null)}
          onSaved={() => { setFormState(null); toast.success(formState.product ? 'Product updated' : 'Product created'); load(); }}
        />
      )}
    </div>
  );
}
