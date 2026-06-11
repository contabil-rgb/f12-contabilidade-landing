export function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function isYes(value) {
  return normalizeText(value) === 'sim';
}

export function isNo(value) {
  return normalizeText(value) === 'nao';
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeCnpj(value) {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.length <= 14 ? digits.padStart(14, '0') : digits;
}

export function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return String(value ?? '').trim();
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatCnpjInput(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatNumber(value) {
  if (isBlank(value)) return '0';
  const number = Number(String(value).replace(',', '.'));
  if (Number.isNaN(number)) return String(value);
  return new Intl.NumberFormat('pt-BR').format(number);
}

export function formatCurrency(value) {
  if (isBlank(value)) return 'Não informado';
  const normalized = String(value).replace(/[^\d,-]/g, '').replace(',', '.');
  const number = Number(normalized);
  if (Number.isNaN(number)) return String(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(number);
}

export function todayBr() {
  return new Intl.DateTimeFormat('pt-BR').format(new Date());
}

export function stableIdFromCnpj(cnpj, fallback) {
  const digits = normalizeCnpj(cnpj);
  const safeFallback = fallback ?? globalThis.crypto?.randomUUID?.() ?? Date.now();
  return digits ? `cliente-${digits}` : `cliente-${safeFallback}`;
}

export function uniqueValues(values) {
  const groups = new Map();

  values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = normalizeText(value);
      const current = groups.get(key);
      if (!current || isPreferredDisplayValue(value, current)) {
        groups.set(key, value);
      }
    });

  return Array.from(groups.values());
}

function countDiacritics(value) {
  const normalized = String(value ?? '').normalize('NFD');
  const matches = normalized.match(/\p{Diacritic}/gu);
  return matches ? matches.length : 0;
}

function isPreferredDisplayValue(candidate, current) {
  const candidateDiacritics = countDiacritics(candidate);
  const currentDiacritics = countDiacritics(current);
  if (candidateDiacritics !== currentDiacritics) {
    return candidateDiacritics > currentDiacritics;
  }

  if (candidate.length !== current.length) {
    return candidate.length > current.length;
  }

  return candidate.localeCompare(current, 'pt-BR', { sensitivity: 'variant' }) < 0;
}

export function getFieldLabel(fieldDefinitions, key) {
  return fieldDefinitions.find((field) => field.key === key)?.label ?? key;
}

export function sortByLocale(rows, key, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const leftNumber = Number(String(left ?? '').replace(',', '.'));
    const rightNumber = Number(String(right ?? '').replace(',', '.'));
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return (leftNumber - rightNumber) * multiplier;
    }
    return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    }) * multiplier;
  });
}
