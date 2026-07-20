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
  home: 'M3 11l9-8 9 8 M5 10v10h14V10',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6',
  building: 'M4 21V4h10v17 M14 21V9h6v12 M7 8h1 M7 12h1 M7 16h1',
  dollar: 'M12 2v20 M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.4-5 3.2c0 3.8 10 1.8 10 6 0 2-2.4 3.3-5 3.3s-5-1.4-5-3.5',
  columns: 'M4 4h4v16H4z M10 4h4v16h-4z M16 4h4v16h-4z',
  headset: 'M4 13a8 8 0 0 1 16 0 M4 13v4a2 2 0 0 0 2 2h1v-6H5a1 1 0 0 0-1 1z M20 13v4a2 2 0 0 1-2 2h-1v-6h1a1 1 0 0 1 1 1z',
  ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z',
  checklist: 'M9 6h11 M9 12h11 M9 18h11 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  sparkle: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z',
  'external-link': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
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
