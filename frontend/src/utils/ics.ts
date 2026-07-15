// Minimal iCalendar (.ics) generation — a universally-supported calendar
// invite the rep can open in Outlook/Google Calendar and forward to the
// customer, with zero calendar-API credentials required.

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function downloadMeetingInvite(opts: {
  title: string;
  start: Date;
  durationMinutes: number;
  description?: string;
  organizerEmail?: string;
  attendee?: { name?: string; email: string };
}): void {
  const end = new Date(opts.start.getTime() + opts.durationMinutes * 60000);
  const uid = `${crypto.randomUUID()}@iprofit-crm`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iProfit CRM//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${icsEscape(opts.description)}`] : []),
    ...(opts.organizerEmail ? [`ORGANIZER:mailto:${opts.organizerEmail}`] : []),
    ...(opts.attendee ? [`ATTENDEE;CN=${icsEscape(opts.attendee.name ?? opts.attendee.email)};RSVP=TRUE:mailto:${opts.attendee.email}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'meeting'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
