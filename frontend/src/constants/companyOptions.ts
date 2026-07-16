export const COMPANY_SIZES = ['1-10', '11-50', '51-100', '101-250', '251-500', '501-1000', '1001-5000', '5001-10000', '10000+'];

export const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing', 'Education', 'Real Estate', 'Hospitality',
  'Telecommunications', 'Media & Entertainment', 'Transportation & Logistics', 'Construction', 'Energy',
  'Agriculture', 'Government', 'Non-profit', 'Consulting', 'Other',
];

export const REVENUE_BANDS: { value: 'LT_1CR' | 'CR_1_10' | 'CR_10_50' | 'CR_50_100' | 'CR_100_PLUS'; label: string }[] = [
  { value: 'LT_1CR', label: '< ₹1 Cr' },
  { value: 'CR_1_10', label: '₹1-10 Cr' },
  { value: 'CR_10_50', label: '₹10-50 Cr' },
  { value: 'CR_50_100', label: '₹50-100 Cr' },
  { value: 'CR_100_PLUS', label: '₹100 Cr+' },
];
