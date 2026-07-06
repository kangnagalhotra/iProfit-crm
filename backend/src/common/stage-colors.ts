// CRM-approved Kanban stage colors — kept in sync with frontend/src/constants/stageColors.ts.
// Values are the existing brand hex colors already used elsewhere in the app (chips, priorities),
// so restricting stage colors to this set introduces no new visual language.
export const ALLOWED_STAGE_COLORS = [
  '#025ADF', // Blue
  '#16A34A', // Green
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#DC2626', // Red
  '#6B7280', // Gray
] as const;
