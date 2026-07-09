import { supabase } from '../lib/supabase';
import type { LineItem } from './types';

function mapLineItem(row: any): LineItem {
  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    productName: row.product_name,
    quantity: String(row.quantity),
    unitPrice: String(row.unit_price),
  };
}

export async function listLineItems(opportunityId: string): Promise<LineItem[]> {
  const { data, error } = await supabase.from('deal_line_items').select('*').eq('opportunity_id', opportunityId).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(mapLineItem);
}

export async function replaceLineItems(
  opportunityId: string,
  rows: { productId?: string; productName: string; quantity: string; unitPrice: string }[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('deal_line_items').delete().eq('opportunity_id', opportunityId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from('deal_line_items').insert(
    rows.map((r, i) => ({
      opportunity_id: opportunityId,
      product_id: r.productId || null,
      product_name: r.productName,
      quantity: r.quantity || '1',
      unit_price: r.unitPrice || '0',
      sort_order: i,
    })),
  );
  if (insertError) throw insertError;
}
