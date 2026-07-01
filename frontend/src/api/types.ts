export type Role = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP';
export type LeadStatus = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'UNQUALIFIED' | 'CONNECTED';
export type LeadSource = 'MANUAL' | 'IMPORT' | 'WEB_FORM' | 'API';
export type PreferredContactMethod = 'EMAIL' | 'PHONE' | 'SMS';

export interface User { id: string; fullName: string; email: string; role: Role; }

export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  preferredContactMethod?: PreferredContactMethod;
  status: LeadStatus;
  source?: LeadSource;
  score: number;
  owner?: { id: string; fullName: string };
  account?: { id: string; name: string };
  lastActivityAt?: string;
  updatedAt: string;
}

export interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; }

export interface ImportLeadError { row: number; email?: string; message: string; }
export interface ImportLeadsResult {
  created: Lead[];
  errors: ImportLeadError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export type AccountStatus = 'PROSPECT' | 'ACTIVE_CUSTOMER' | 'ON_HOLD' | 'CHURNED';

export interface Account {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  sizeBucket?: string;
  city?: string;
  state?: string;
  country?: string;
  status: AccountStatus;
  owner?: { id: string; fullName: string };
  updatedAt: string;
}

export interface ImportAccountError { row: number; domain?: string; message: string; }
export interface ImportAccountsResult {
  created: Account[];
  errors: ImportAccountError[];
  summary: { total: number; createdCount: number; errorCount: number };
}
