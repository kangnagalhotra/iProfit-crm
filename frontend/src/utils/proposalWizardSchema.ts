// Detailed Proposal Wizard — 9-section schema, ported directly from the
// supplied prototype (proposal_creation_form.html). This is the single
// source of truth ProposalWizardModal.tsx renders generically; adding a
// second wizard template later means adding another constant like this
// one plus a small picker, not restructuring the renderer.

export type ProposalFieldType = 'text' | 'textarea' | 'date' | 'number' | 'select' | 'choice';

export interface ProposalFieldShowIf { field: string; value: string; }

export interface ProposalField {
  k: string;
  label: string;
  type: ProposalFieldType;
  required?: boolean;
  full?: boolean;
  hint?: string;
  options?: string[];
  showIf?: ProposalFieldShowIf;
}

export interface ProposalLineItemCol { k: string; label: string; type: 'text' | 'number' | 'date'; }

export interface ProposalLineItemSpec {
  key: string;
  label: string;
  addLabel: string;
  pricing?: boolean;
  milestone?: boolean;
  cols: ProposalLineItemCol[];
}

export interface ProposalApprovalBlock {
  key: string;
  title: string;
  fields: ProposalField[];
}

export interface ProposalFinalStatus { k: string; label: string; options: string[]; }

export interface ProposalSection {
  id: string;
  title: string;
  num: string;
  sub: string;
  fields?: ProposalField[];
  lineItems?: ProposalLineItemSpec;
  approvalBlocks?: ProposalApprovalBlock[];
  checklist?: string[];
  finalStatus?: ProposalFinalStatus;
}

export const PROPOSAL_WIZARD_SECTIONS: ProposalSection[] = [
  {
    id: 'info',
    title: 'Proposal Information',
    num: '01',
    sub: 'High-level identifiers so this proposal is traceable to a CRM deal.',
    fields: [
      { k: 'proposalTitle', label: 'Proposal Title', type: 'text', required: true },
      { k: 'customerName', label: 'Customer / Company Name', type: 'text', required: true },
      { k: 'preparedFor', label: 'Prepared For', type: 'text', required: true, hint: 'primary contact name' },
      { k: 'preparedBy', label: 'Prepared By', type: 'text', required: true },
      { k: 'dealName', label: 'CRM Opportunity / Deal Name', type: 'text', required: true },
      { k: 'proposalDate', label: 'Proposal Date', type: 'date', required: true },
      { k: 'proposalVersion', label: 'Proposal Version', type: 'text', required: true, hint: 'e.g. v1.0' },
    ],
  },
  {
    id: 'company',
    title: 'Company Overview',
    num: '02',
    sub: 'Why we’re credible — this becomes Section 1 of the generated document.',
    fields: [
      { k: 'companyName', label: 'Company Name', type: 'text', required: true },
      {
        k: 'companyDesc', label: 'Brief Company Description', type: 'textarea', required: true, full: true,
      },
      { k: 'yearsInBusiness', label: 'Years in Business', type: 'text', required: false },
      {
        k: 'keyStrengths', label: 'Key Strengths', type: 'textarea', required: true, full: true,
      },
      {
        k: 'goodFit', label: 'Why is our company a good fit for this customer?', type: 'textarea', required: true, full: true,
      },
      {
        k: 'relevantExperience', label: 'Relevant Experience or Case Studies', type: 'textarea', required: false, full: true,
      },
    ],
  },
  {
    id: 'requirements',
    title: 'Customer Requirements',
    num: '03',
    sub: 'What the customer is trying to solve, in their own terms.',
    fields: [
      {
        k: 'businessChallenge', label: 'Customer Business Challenge', type: 'textarea', required: true, full: true,
      },
      {
        k: 'customerGoals', label: 'Customer Goals', type: 'textarea', required: true, full: true,
      },
      {
        k: 'solutionSummary', label: 'Proposed Solution Summary', type: 'textarea', required: true, full: true,
      },
      {
        k: 'keyBenefits', label: 'Key Benefits to Customer', type: 'textarea', required: true, full: true,
      },
    ],
  },
  {
    id: 'scope',
    title: 'Scope of Work',
    num: '04',
    sub: 'Deliverables support multiple line items — add one row per item.',
    fields: [
      {
        k: 'servicesIncluded', label: 'Services Included', type: 'textarea', required: true, full: true,
      },
      {
        k: 'productsIncluded', label: 'Products Included', type: 'textarea', required: false, full: true,
      },
      {
        k: 'assumptions', label: 'Assumptions', type: 'textarea', required: false, full: true,
      },
      {
        k: 'exclusions', label: 'Exclusions (if any)', type: 'textarea', required: false, full: true,
      },
    ],
    lineItems: {
      key: 'deliverables',
      label: 'Deliverables',
      addLabel: '+ Add deliverable',
      cols: [
        { k: 'item', label: 'Deliverable', type: 'text' },
        { k: 'detail', label: 'Description', type: 'text' },
      ],
    },
  },
  {
    id: 'pricing',
    title: 'Pricing',
    num: '05',
    sub: 'Pricing breakdown supports multiple line items.',
    fields: [
      {
        k: 'currency', label: 'Currency', type: 'select', required: true, options: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'Other'],
      },
      { k: 'totalValue', label: 'Total Proposal Value', type: 'number', required: true },
      {
        k: 'pricingModel', label: 'Pricing Model', type: 'choice', required: true, options: ['Fixed Price', 'Subscription', 'Time & Materials', 'Other'],
      },
      {
        k: 'pricingModelOther', label: 'If Other, please specify', type: 'text', required: false, showIf: { field: 'pricingModel', value: 'Other' },
      },
      { k: 'additionalFees', label: 'Additional Fees', type: 'text', required: false },
      { k: 'discountsApplied', label: 'Discounts Applied', type: 'text', required: false },
    ],
    lineItems: {
      key: 'pricingLines',
      label: 'Pricing Breakdown',
      addLabel: '+ Add pricing line',
      pricing: true,
      cols: [
        { k: 'item', label: 'Line Item', type: 'text' },
        { k: 'qty', label: 'Qty', type: 'text' },
        { k: 'amount', label: 'Amount', type: 'number' },
      ],
    },
  },
  {
    id: 'timeline',
    title: 'Timeline',
    num: '06',
    sub: 'Milestones support multiple entries with their own delivery dates.',
    fields: [
      { k: 'startDate', label: 'Project Start Date', type: 'date', required: true },
      { k: 'endDate', label: 'Project End Date', type: 'date', required: true },
      {
        k: 'dependencies', label: 'Dependencies', type: 'textarea', required: false, full: true,
      },
    ],
    lineItems: {
      key: 'milestones',
      label: 'Key Milestones',
      addLabel: '+ Add milestone',
      milestone: true,
      cols: [
        { k: 'milestone', label: 'Milestone', type: 'text' },
        { k: 'date', label: 'Expected Date', type: 'date' },
        { k: 'owner', label: 'Owner / Notes', type: 'text' },
      ],
    },
  },
  {
    id: 'terms',
    title: 'Terms & Conditions',
    num: '07',
    sub: 'Commercial and contractual conditions attached to this proposal.',
    fields: [
      { k: 'paymentTerms', label: 'Payment Terms', type: 'text', required: true },
      {
        k: 'validityPeriod', label: 'Proposal Validity Period', type: 'text', required: true, hint: 'e.g. 30 days',
      },
      {
        k: 'contractTerms', label: 'Contract Terms', type: 'textarea', required: false, full: true,
      },
      {
        k: 'specialConditions', label: 'Special Conditions', type: 'textarea', required: false, full: true,
      },
      {
        k: 'additionalNotes', label: 'Additional Notes', type: 'textarea', required: false, full: true,
      },
    ],
  },
  {
    id: 'signature',
    title: 'Approval & Signature',
    num: '08',
    sub: 'Customer-facing acceptance details.',
    fields: [
      { k: 'signatoryName', label: 'Customer Signatory Name', type: 'text', required: true },
      { k: 'signatoryTitle', label: 'Customer Title', type: 'text', required: true },
      {
        k: 'signatureRequired', label: 'Signature Required', type: 'choice', required: true, options: ['Yes', 'No'],
      },
      { k: 'acceptanceDate', label: 'Acceptance Date', type: 'date', required: false },
    ],
  },
  {
    id: 'approvals',
    title: 'Internal Approvals Checklist',
    num: '09',
    sub: 'Complete before this proposal is submitted to the customer.',
    approvalBlocks: [
      {
        key: 'presales',
        title: 'Pre-Sales Approval',
        fields: [
          {
            k: 'presalesReviewed', label: 'Has the solution been reviewed by the Pre-Sales team?', type: 'choice', options: ['Yes', 'No', 'N/A'],
          },
          { k: 'presalesApprover', label: 'Pre-Sales Approver Name', type: 'text' },
          { k: 'presalesDate', label: 'Approval Date', type: 'date' },
          { k: 'presalesComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'pricingAppr',
        title: 'Pricing Approval',
        fields: [
          { k: 'pricingApproved', label: 'Has pricing been approved?', type: 'choice', options: ['Yes', 'No'] },
          { k: 'pricingApprover', label: 'Pricing Approver Name', type: 'text' },
          { k: 'pricingApprDate', label: 'Approval Date', type: 'date' },
          { k: 'discountPercentage', label: 'Discount Percentage', type: 'text' },
          { k: 'pricingComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'finance',
        title: 'Finance Approval',
        fields: [
          {
            k: 'financeApproved', label: 'Has Finance approved commercial terms?', type: 'choice', options: ['Yes', 'No', 'N/A'],
          },
          { k: 'financeApprover', label: 'Finance Approver Name', type: 'text' },
          { k: 'financeDate', label: 'Approval Date', type: 'date' },
          { k: 'financeComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'legal',
        title: 'Legal Approval',
        fields: [
          {
            k: 'legalReviewed', label: 'Has Legal reviewed any exceptions or special terms?', type: 'choice', options: ['Yes', 'No', 'N/A'],
          },
          { k: 'legalApprover', label: 'Legal Approver Name', type: 'text' },
          { k: 'legalDate', label: 'Approval Date', type: 'date' },
          { k: 'legalComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'management',
        title: 'Management Approval',
        fields: [
          { k: 'managerApproved', label: 'Has Sales Manager approved this proposal?', type: 'choice', options: ['Yes', 'No'] },
          { k: 'managerName', label: 'Manager Name', type: 'text' },
          { k: 'managerDate', label: 'Approval Date', type: 'date' },
          { k: 'managerComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'executive',
        title: 'Executive Approval',
        fields: [
          { k: 'execRequired', label: 'Is executive approval required?', type: 'choice', options: ['Yes', 'No'] },
          { k: 'execApprover', label: 'Executive Approver Name', type: 'text' },
          { k: 'execStatus', label: 'Approval Status', type: 'text' },
          { k: 'execDate', label: 'Approval Date', type: 'date' },
          { k: 'execComments', label: 'Comments', type: 'textarea' },
        ],
      },
      {
        key: 'risk',
        title: 'Risk Review',
        fields: [
          { k: 'risksApproved', label: 'Have all risks been documented and approved?', type: 'choice', options: ['Yes', 'No'] },
          { k: 'riskOwner', label: 'Risk Owner', type: 'text' },
          { k: 'riskComments', label: 'Comments', type: 'textarea' },
        ],
      },
    ],
    checklist: [
      'Customer information verified',
      'Scope of work completed',
      'Pricing finalized',
      'Timeline agreed internally',
      'Terms & Conditions reviewed',
      'Required approvals obtained',
      'Proposal document reviewed',
      'Ready for customer submission',
    ],
    finalStatus: {
      k: 'overallStatus',
      label: 'Overall Approval Status',
      options: ['Draft', 'Pending Approval', 'Approved for Submission', 'Submitted to Customer'],
    },
  },
];

// Sections whose fields feed the customer-facing generated document —
// Section 9 (Internal Approvals) is deliberately excluded, it's
// CRM-internal only.
export const CUSTOMER_FACING_SECTION_IDS = ['info', 'company', 'requirements', 'scope', 'pricing', 'timeline', 'terms', 'signature'];

export function emptyLineItemState(): Record<string, Record<string, string>[]> {
  return { deliverables: [{}], pricingLines: [{}], milestones: [{}] };
}
