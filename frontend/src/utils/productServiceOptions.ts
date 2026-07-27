// Reused by ProductForm.tsx — a curated default list plus a free-text
// Other, same shape as DEPARTMENT_OPTIONS/DEAL_LOSS_REASONS. Stored as a
// single free varchar column (products.category), not a DB enum, so this
// list can grow later without a migration.
export const PRODUCT_SERVICE_OTHER = 'OTHER';

export const PRODUCT_SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Software Development', label: 'Software Development' },
  { value: 'Cloud Services', label: 'Cloud Services' },
  { value: 'Cybersecurity', label: 'Cybersecurity' },
  { value: 'Data & Analytics', label: 'Data & Analytics' },
  { value: 'IT Consulting', label: 'IT Consulting' },
  { value: 'Managed IT Services', label: 'Managed IT Services' },
  { value: 'Networking & Infrastructure', label: 'Networking & Infrastructure' },
  { value: 'Technical Support', label: 'Technical Support' },
  { value: PRODUCT_SERVICE_OTHER, label: 'Other' },
];
