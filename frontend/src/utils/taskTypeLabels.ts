import type { TaskType } from '../api/types';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  TODO: 'To-Do',
  CALL: 'Call',
  EMAIL: 'Email',
  FOLLOW_UP: 'Follow-up',
  MEETING: 'Meeting',
  OTHER: 'Other',
};
