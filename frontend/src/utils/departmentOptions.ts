// Reused by LeadForm.tsx (and anywhere else Department/Division needs to be
// picked) — a curated default list plus a free-text Other, same shape as
// DEAL_LOSS_REASONS in dealLossReasons.ts. Stored as a single free varchar
// column (leads.department), not a DB enum, so this list can grow later
// without a migration.
export const DEPARTMENT_OTHER = 'OTHER';

export const DEPARTMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'Sales', label: 'Sales' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'IT / Engineering', label: 'IT / Engineering' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'HR', label: 'HR' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Customer Support', label: 'Customer Support' },
  { value: 'Executive / Leadership', label: 'Executive / Leadership' },
  { value: DEPARTMENT_OTHER, label: 'Other' },
];
