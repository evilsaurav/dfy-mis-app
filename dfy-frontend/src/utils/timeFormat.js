/**
 * Formats a raw timestamp or time string into 12-hour IST format (e.g., "08:30 AM", "03:45 PM").
 * Handles:
 * - Empty/null/undefined values
 * - Pre-formatted 12-hour strings like "08:30 pm" or "8:30 am"
 * - ISO date/time strings with UTC offsets or Z
 * - Fallback to raw string if parsing fails
 */
export const formatIstTime = (rawTs) => {
  if (!rawTs) return '';
  const str = String(rawTs).trim();
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    const hh = match12[1].padStart(2, '0');
    const mm = match12[2];
    const ampm = match12[3].toUpperCase();
    return `${hh}:${mm} ${ampm}`;
  }
  const d = new Date(rawTs);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(/[\u202f\u00a0]/g, ' ').toUpperCase();
};
