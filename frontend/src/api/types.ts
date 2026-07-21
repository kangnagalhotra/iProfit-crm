export type Role = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP';
// Lead Source is an admin-configurable list (lead_source_options table),
// not a fixed enum — see api/leadSourceOptions.ts.
export interface LeadSourceOption { id: string; name: string; order: number; isActive: boolean; }
export type Salutation = 'MR' | 'MS' | 'MRS' | 'DR' | 'PROF';
export type RevenueBand = 'LT_1CR' | 'CR_1_10' | 'CR_10_50' | 'CR_50_100' | 'CR_100_PLUS';
export interface SocialLink { id: string; platform: string; url: string; order: number; }
export type LeadRating = 'HOT' | 'WARM' | 'COLD';
export type LeadUnqualifiedReason = 'NO_BUDGET' | 'NOT_A_FIT' | 'NO_RESPONSE' | 'COMPETITOR' | 'BAD_DATA' | 'OTHER';

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

export interface LeadAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  leadName?: string;
  salutation?: Salutation;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailOptIn?: boolean;
  phone?: string;
  mobile?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  socialLinks?: SocialLink[];
  city?: string;
  value?: string;
  notes?: string;
  stage: LeadStage;
  source?: { id: string; name: string };
  sourceDetails?: string;
  // 0-100 manual field, unrelated to the BANT budget/authority/need/timeline
  // sum below (separate concept, separate scale).
  score: number;
  rating?: LeadRating;
  unqualifiedReason?: LeadUnqualifiedReason;
  unqualifiedReasonOther?: string;
  tags?: string[];
  owner?: { id: string; fullName: string };
  // Additive co-owners — collaborators beyond the primary owner above.
  // Display-only; access control still keys off `owner` alone.
  additionalOwners?: { id: string; fullName: string }[];
  createdBy?: { id: string; fullName: string };
  account?: { id: string; name: string };
  lastActivityAt?: string;
  // BANT qualification (0-10 each); qualificationNotes is free text.
  budgetScore?: number;
  authorityScore?: number;
  needScore?: number;
  timelineScore?: number;
  qualificationNotes?: string;
  // MQL gate — required (with budgetScore/authorityScore) before a lead can
  // enter a "won" (Qualified) stage; enforced server-side, see triggers.sql.
  icpMatch?: boolean;
  convertedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  jobTitle?: string; // shown as "Designation" in the Contacts UI
  department?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  socialLinks?: SocialLink[];
  notes?: string;
  account?: { id: string; name: string; stage?: { name: string; color: string } };
  // A Contact can be linked to multiple Leads (and vice versa) via lead_contacts.
  leads?: { id: string; firstName?: string; lastName?: string; email?: string }[];
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
  isInactiveStage: boolean;
}

export interface CustomerStage extends Stage {
  isRenewedStage: boolean;
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
  postalCode?: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  annualRevenue?: RevenueBand;
  currency?: Currency;
  stage: AccountStage;
  customerStage?: CustomerStage;
  owner?: { id: string; fullName: string };
  lastInactivityAlertAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportAccountError { row: number; domain?: string; message: string; }
export interface ImportAccountsResult {
  created: Account[];
  errors: ImportAccountError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export type DealType = 'NEW_BUSINESS' | 'EXISTING_BUSINESS' | 'RENEWAL' | 'UPSELL';
export type DealPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR';
export type DealContactRole = 'CHAMPION' | 'DECISION_MAKER' | 'INFLUENCER' | 'BLOCKER' | 'OTHER';
export type ForecastCategory = 'COMMIT' | 'BEST_CASE' | 'PIPELINE' | 'OMITTED';
export type DecisionTimeframe = 'LESS_THAN_1_MONTH' | 'ONE_TO_3_MONTHS' | 'THREE_TO_6_MONTHS' | 'SIX_PLUS_MONTHS';

export interface DealStage extends Stage {
  winProbability: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

export interface LineItem {
  id: string;
  productId?: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

export type ProductSector = 'PRIVATE' | 'GOVERNMENT' | 'BOTH';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  sector: ProductSector;
  unitPrice: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProposalTemplateKind = 'TEXT' | 'WIZARD' | 'EXTERNAL';
export interface ProposalTemplate { id: string; name: string; body: string; kind: ProposalTemplateKind; isDefault: boolean; }

export interface DealProposal {
  id: string;
  version: number;
  sentDate: string;
  value?: string;
  notes?: string;
  templateId?: string;
  // Full 9-section wizard submission; undefined for simple/free-text versions.
  content?: Record<string, any>;
  createdAt: string;
}

export interface StageAutomationRule {
  id: string;
  fromStage: { id: string; name: string };
  toStage: { id: string; name: string };
  requiresActivityType: ActivityType;
  requiresField?: string;
  enabled: boolean;
}

export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'DELAYED';

export interface Project {
  id: string;
  name: string;
  status: string;
  health: ProjectHealth;
  satisfaction?: number;
  value?: string;
  createdAt: string;
  opportunity?: { id: string; name: string; renewalDate?: string; lastActivityAt?: string; owner?: { id: string; fullName: string } };
  account?: { id: string; name: string };
}

export interface DealContact {
  contactId: string;
  role: DealContactRole;
  roleOther?: string;
  contact?: { id: string; firstName?: string; lastName?: string; email?: string };
}

export interface DealAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface StageHistoryEntry {
  id: string;
  stage: { id: string; name: string; color: string };
  changedAt: string;
  changedBy?: { id: string; fullName: string };
}

export interface Opportunity {
  id: string;
  name: string;
  amount?: string;
  closeDate?: string;
  closedAt?: string;
  dealType: DealType;
  priority: DealPriority;
  lossReason?: string;
  description?: string;
  source?: string;
  currency: Currency;
  probabilityOverride?: number;
  nextStep?: string;
  nextActivityDate?: string;
  competitor?: string;
  budgetConfirmed?: boolean;
  decisionTimeframe?: DecisionTimeframe;
  painPoint?: string;
  tags: string[];
  partnerAccount?: { id: string; name: string };
  // null/undefined = derive from stage; a stored value is a rep override.
  forecastCategory?: ForecastCategory;
  forecastJustification?: string;
  // null/undefined = auto (Value x Probability); set = rep/manager override.
  expectedRevenue?: string;
  // Computed engagement score (0-100) + last real-activity stamp — written
  // by DB triggers, read-only in the UI.
  score: number;
  lastActivityAt?: string;
  renewalDate?: string;
  pipeline: { id: string; name: string };
  stage: DealStage;
  owner?: { id: string; fullName: string };
  additionalOwners?: { id: string; fullName: string }[];
  account?: { id: string; name: string; description?: string; stage?: { name: string; color: string } };
  lead?: { id: string; firstName?: string; lastName?: string; email?: string };
  contact?: { id: string; firstName?: string; lastName?: string; email?: string; mobile?: string; phone?: string };
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Detail-view-only extra, populated by getDeal() but not listDeals().
  daysInCurrentStage?: number;
}

export interface ImportOpportunityError { row: number; name?: string; message: string; }
export interface ImportOpportunitiesResult {
  created: Opportunity[];
  errors: ImportOpportunityError[];
  summary: { total: number; createdCount: number; errorCount: number };
}

export type TaskType = 'TODO' | 'CALL' | 'EMAIL' | 'FOLLOW_UP' | 'MEETING';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ChecklistItem { id: string; title: string; isDone: boolean; order: number; }

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string;
  notes?: string;
  reminderAt?: string;
  // Sub-tasks (checklist-style) — own assignee/due date, just a rollup
  // checklist under this task. Populated by listTasks/getTask.
  checklist?: ChecklistItem[];
  assignee?: { id: string; fullName: string };
  lead?: { id: string; firstName?: string; lastName?: string; email?: string; mobile?: string };
  account?: { id: string; name: string; phone?: string; email?: string };
  opportunity?: { id: string; name: string; contact?: { firstName?: string; lastName?: string; email?: string; mobile?: string } };
  contact?: { id: string; firstName?: string; lastName?: string; email?: string; mobile?: string };
  createdVia: 'MANUAL' | 'QUICK_ACTION';
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

export type NotificationType = 'RECORD_ASSIGNED' | 'TASK_DUE' | 'STAGE_CHANGED' | 'MENTION' | 'LEAD_INACTIVE' | 'DEAL_INACTIVE' | 'ACCOUNT_INACTIVE';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  linkUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SupportTicket {
  id: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  account: { id: string; name: string };
  contact?: { id: string; firstName?: string; lastName?: string; email?: string };
  assignee?: { id: string; fullName: string };
  dueAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketSummary {
  total: number;
  open: number;
  critical: number;
}
