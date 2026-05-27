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
  const seen = new Set();
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
