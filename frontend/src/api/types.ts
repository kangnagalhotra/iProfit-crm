export type Role = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP';
export type LeadSource = 'IMPORT' | 'OUTREACH' | 'EMAIL' | 'CAMPAIGN' | 'REFERRAL' | 'WEBSITE' | 'SOCIAL_MEDIA' | 'EVENT' | 'PARTNER' | 'OTHER';

export interface User { id: string; fullName: string; email: string; role: Role; }

export interface Stage {
  id: string;
  name: string;
  order: number;
  color: string;
  isDefault: boolean;
}

export interface LeadStage extends Stage {
  isWon: boolean;
  isLost: boolean;
}

export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'FIELD_UPDATE';

export interface Activity {
  id: string;
  type: ActivityType;
  body: string;
  occurredAt: string;
  creator: { id: string; fullName: string };
}

export interface Lead {
  id: string;
  leadName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  value?: string;
  notes?: string;
  stage: LeadStage;
  source?: LeadSource;
  score: number;
  owner?: { id: string; fullName: string };
  account?: { id: string; name: string };
  lastActivityAt?: string;
  // BANT qualification (0-10 each); qualificationNotes is free text.
  budgetScore?: number;
  authorityScore?: number;
  needScore?: number;
  timelineScore?: number;
  qualificationNotes?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  account?: { id: string; name: string };
  lead?: { id: string };
  owner?: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; }

export interface ImportLeadError { row: number; email?: string; message: string; }
export interface ImportLeadsResult {
  created: Lead[];
  errors: ImportLeadError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export interface AccountStage extends Stage {
  isCustomerStage: boolean;
}

export interface Account {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  sizeBucket?: string;
  city?: string;
  state?: string;
  country?: string;
  companyType?: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  annualRevenue?: string;
  stage: AccountStage;
  owner?: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}

export interface ImportAccountError { row: number; domain?: string; message: string; }
export interface ImportAccountsResult {
  created: Account[];
  errors: ImportAccountError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export type DealType = 'NEW_BUSINESS' | 'EXISTING_BUSINESS' | 'RENEWAL';

export interface DealStage extends Stage {
  winProbability: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

export interface Opportunity {
  id: string;
  name: string;
  amount?: string;
  closeDate?: string;
  closedAt?: string;
  dealType: DealType;
  description?: string;
  source?: string;
  pipeline: { id: string; name: string };
  stage: DealStage;
  owner?: { id: string; fullName: string };
  account?: { id: string; name: string };
  lead?: { id: string; firstName?: string; lastName?: string; email?: string };
  contact?: { id: string; firstName?: string; lastName?: string; email?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ImportOpportunityError { row: number; name?: string; message: string; }
export interface ImportOpportunitiesResult {
  created: Opportunity[];
  errors: ImportOpportunityError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export type TaskType = 'TODO' | 'CALL' | 'EMAIL' | 'FOLLOW_UP';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string;
  notes?: string;
  reminderAt?: string;
  assignee?: { id: string; fullName: string };
  lead?: { id: string; firstName?: string; lastName?: string; email?: string };
  account?: { id: string; name: string };
  opportunity?: { id: string; name: string };
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
}

export type NotificationType = 'RECORD_ASSIGNED' | 'TASK_DUE' | 'STAGE_CHANGED' | 'MENTION' | 'LEAD_INACTIVE' | 'DEAL_INACTIVE';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  linkUrl?: string;
  isRead: boolean;
  createdAt: string;
}
