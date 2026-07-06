// Small hand-rolled line-icon set (no icon-library dependency) used to replace
// raw emoji on the detail pages — consistent stroke weight/color instead of
// OS-dependent emoji rendering.
const PATHS: Record<string, string> = {
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  check: 'M20 6 9 17l-5-5',
  note: 'M4 4h16v12H8l-4 4V4z',
  calendar: 'M8 2v4 M16 2v4 M3 9h18 M4 4h16v16H4V4z',
  mail: 'M4 4h16v16H4V4z M4 5l8 7 8-7',
  phone: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.2 11.2 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.2 11.2 0 0 0 .56 3.5 1 1 0 0 1-.25 1z',
  plus: 'M12 5v14 M5 12h14',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  chevronDown: 'M6 9l6 6 6-6',
  copy: 'M9 9h11v11H9z M5 15V4h11',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  const d = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}
