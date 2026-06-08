// Shared header normalization utility for Excel uploaders.
export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .trim()
    .replace(/\s+/g, '_');
}

export function normalizeRow<T extends Record<string, any>>(row: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) out[normalizeHeader(k)] = row[k];
  return out;
}

export function parseBool(v: any): boolean | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'y', 'x'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

export function parseNum(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[$,\s]/g, '').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function parseInt2(v: any): number | null {
  const n = parseNum(v);
  return n == null ? null : Math.trunc(n);
}

export function parseDate(v: any): string | null {
  if (v == null || v === '') return null;
  // Handle Excel serial number
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
