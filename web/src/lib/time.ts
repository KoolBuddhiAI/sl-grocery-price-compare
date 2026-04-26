const ASIA_COLOMBO_TIME_ZONE = 'Asia/Colombo';

export function formatAsiaColomboTimestamp(dateStr: string | null): string {
  if (!dateStr) return 'No timestamp';

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp';

  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    return new Intl.DateTimeFormat('en-LK', {
      timeZone: ASIA_COLOMBO_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  return date.toISOString();
}

export function getAsiaColomboTimeZoneLabel(): string {
  return 'UTC+5:30';
}

export function getAsiaColomboTimeZoneTooltip(): string {
  return 'Asia/Colombo';
}
