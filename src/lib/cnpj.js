import { onlyDigits } from './formatters.js';

const CNPJ_ALLOWED_CHARACTERS = /^[\d./\-\s]+$/;
const REPEATED_CNPJ_DIGITS = /^(\d)\1{13}$/;

export function normalizeCnpjDigits(value) {
  return onlyDigits(value);
}

export function isValidCnpj(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !CNPJ_ALLOWED_CHARACTERS.test(raw)) return false;

  const digits = normalizeCnpjDigits(raw);
  if (digits.length !== 14 || REPEATED_CNPJ_DIGITS.test(digits)) return false;

  const calculateDigit = (length) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12])
    && calculateDigit(13) === Number(digits[13]);
}

export function getCnpjValidationError(
  value,
  { originalValue = '', allowUnchangedInvalid = false } = {},
) {
  const digits = normalizeCnpjDigits(value);
  const originalDigits = normalizeCnpjDigits(originalValue);

  if (allowUnchangedInvalid && digits === originalDigits) return '';
  if (digits.length !== 14) return 'CNPJ deve ter 14 dígitos.';
  if (!isValidCnpj(value)) return 'CNPJ inválido. Confira os dígitos informados.';
  return '';
}
