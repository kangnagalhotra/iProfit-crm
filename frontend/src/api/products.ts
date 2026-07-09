import { supabase } from '../lib/supabase';
import type { Product, ProductSector } from './types';

const SELECT = '*';

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    sector: row.sector,
    unitPrice: String(row.unit_price),
    description: row.description ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListProductsParams {
  search?: string; sector?: ProductSector; includeInactive?: boolean;
}

export async function listProducts(params: ListProductsParams = {}): Promise<Product[]> {
  let query = supabase.from('products').select(SELECT).order('name');
  if (!params.includeInactive) query = query.eq('is_active', true);
  if (params.sector) query = query.in('sector', params.sector === 'BOTH' ? ['BOTH'] : [params.sector, 'BOTH']);
  if (params.search) query = query.or(`name.ilike.%${params.search}%,sku.ilike.%${params.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapProduct);
}

export async function getProduct(id: string): Promise<Product> {
  const { data, error } = await supabase.from('products').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapProduct(data);
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    name: input.name, sku: input.sku, category: input.category, sector: input.sector,
    unit_price: input.unitPrice, description: input.description, is_active: input.isActive,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createProduct(input: Record<string, any>): Promise<Product> {
  const { data, error } = await supabase.from('products').insert(toRow(input)).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapProduct(data);
}

export async function updateProduct(id: string, input: Record<string, any>): Promise<Product> {
  const { data, error } = await supabase.from('products').update(toRow(input)).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapProduct(data);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
