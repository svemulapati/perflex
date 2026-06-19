/** Display formatting helpers for the panel UI. */

export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value < 1) return `${value.toFixed(2)}ms`;
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

export function bytes(value: number | null | undefined): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function shortUrl(url: string): string {
  if (!url || url === 'unknown') return 'unknown';
  if (url === '(inline)') return '(inline)';
  try {
    const u = new URL(url);
    const file = u.pathname.split('/').filter(Boolean).pop() ?? u.pathname;
    return file || u.hostname;
  } catch {
    return url.length > 40 ? `…${url.slice(-37)}` : url;
  }
}

export function originOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function scoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 70) return '#F59E0B';
  return '#EF4444';
}
