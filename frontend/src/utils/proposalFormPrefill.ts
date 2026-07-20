import type { Opportunity } from '../api/types';

// Maps Typeform "hidden field" keys to CRM data pulled from the Deal.
//
// IMPORTANT: these key names (company_name, contact_name, ...) are our
// best guess at conventional naming — they MUST match, character for
// character, the hidden fields actually defined inside the Typeform
// editor (form > Connect > Hidden fields). Typeform hidden fields can
// only be declared from inside the form editor, not from the embedding
// side, and an unrecognized query param is silently ignored (no error),
// so a wrong key here doesn't fail loudly — it just quietly never
// prefills. CONFIRM these against the live Typeform before relying on
// them, and update this map to match exactly.
export const PROPOSAL_HIDDEN_FIELD_MAP: Record<string, (deal: Opportunity) => string | undefined> = {
  company_name: (deal) => deal.account?.name,
  contact_name: (deal) => (deal.contact ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') : undefined),
  contact_email: (deal) => deal.contact?.email,
  deal_name: (deal) => deal.name,
  deal_value: (deal) => deal.amount,
  deal_currency: (deal) => deal.currency,
  deal_stage: (deal) => deal.stage?.name,
  owner_name: (deal) => deal.owner?.fullName,
};

// Builds Typeform's data-tf-hidden value: a comma-separated key=value
// list, URL-encoded per Typeform's documented format. Fields with no
// value on this deal (e.g. no linked Contact yet) are simply omitted —
// Typeform then renders that field blank/unprefilled rather than erroring.
export function buildProposalHiddenFields(deal: Opportunity): string {
  return Object.entries(PROPOSAL_HIDDEN_FIELD_MAP)
    .map(([key, getValue]) => [key, getValue(deal)] as const)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(',');
}
