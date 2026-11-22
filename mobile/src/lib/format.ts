const LAKH = 100_000;
const CRORE = 10_000_000;

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

/** ₹2.5 Cr / ₹80 L */
export function formatInr(value: number): string {
  if (value >= CRORE) return `₹${trim(value / CRORE, 2)} Cr`;
  if (value >= LAKH) return `₹${trim(value / LAKH, 1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function formatAcres(acres: number): string {
  return `${trim(acres, 2)} acre${acres === 1 ? '' : 's'}`;
}

/** "14:05" today, "Yesterday", or "12 Nov". */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse "2.5 cr", "80 lakh" or plain rupees into INR. */
export function parseInr(text: string): number | null {
  const m = text.trim().toLowerCase().match(/^([\d.,]+)\s*(cr|crore|crores|l|lakh|lakhs|lac)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const unit = m[2] ?? '';
  if (unit.startsWith('c')) return Math.round(n * CRORE);
  if (unit.startsWith('l')) return Math.round(n * LAKH);
  return Math.round(n);
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
