export type RangePreset = 'today' | 'week' | 'month' | 'custom';

export interface DateRangeState {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Monday-start week, matching how most reps think about "this week".
function startOfWeek(): Date {
  const today = startOfToday();
  const diffToMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - diffToMonday);
  return start;
}

export function computeRangeBounds(state: DateRangeState): { start: Date; end: Date } {
  const now = new Date();
  if (state.preset === 'today') return { start: startOfToday(), end: now };
  if (state.preset === 'week') return { start: startOfWeek(), end: now };
  if (state.preset === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  const start = state.customStart ? new Date(`${state.customStart}T00:00:00`) : startOfToday();
  const end = state.customEnd ? new Date(`${state.customEnd}T23:59:59`) : now;
  return { start, end };
}

export function DateRangeFilter({ value, onChange }: { value: DateRangeState; onChange: (v: DateRangeState) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as RangePreset })}
        style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}
      >
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="custom">Custom range</option>
      </select>
      {value.preset === 'custom' && (
        <>
          <input
            type="date"
            value={value.customStart}
            onChange={(e) => onChange({ ...value, customStart: e.target.value })}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}
          />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input
            type="date"
            value={value.customEnd}
            onChange={(e) => onChange({ ...value, customEnd: e.target.value })}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}
          />
        </>
      )}
    </div>
  );
}
