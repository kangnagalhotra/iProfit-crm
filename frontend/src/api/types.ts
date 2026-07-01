export type Role = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP';
export type LeadStatus = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'UNQUALIFIED' | 'CONNECTED';

export interface User { id: string; fullName: string; email: string; role: Role; }

export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  status: LeadStatus;
  score: number;
  owner?: { id: string; fullName: string };
  account?: { id: string; name: string };
  updatedAt: string;
}

export interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; }
