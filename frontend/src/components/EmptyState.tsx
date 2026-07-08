import type { IconName } from './Icon';
import { Icon } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title?: string;
  description: string;
  action?: { label: string; onClick: () => void };
  size?: 'sm' | 'md';
}

export function EmptyState({
  icon, title, description, action, size = 'md',
}: EmptyStateProps) {
  return (
    <div className={`empty-state${size === 'sm' ? ' empty-state-sm' : ''}`}>
      <span className="icon"><Icon name={icon} size={size === 'sm' ? 18 : 22} /></span>
      {title && <h4>{title}</h4>}
      <p>{description}</p>
      {action && <button type="button" className="btn secondary" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
