import type { EditLogEntry } from '../model';

/** The most recent edit-log entry, or null when the log is empty/absent. Pure. */
export function lastEdit(editLog: EditLogEntry[] | undefined): EditLogEntry | null {
  return editLog && editLog.length ? editLog[editLog.length - 1] : null;
}

/** Short relative time ("just now" / "5m ago" / "3h ago" / "2d ago") from an ISO timestamp,
 *  given the current time in ms. Empty string for an unparseable input. Pure. */
export function relativeTime(fromIso: string, nowMs: number): string {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}
