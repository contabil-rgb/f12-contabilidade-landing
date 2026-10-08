const ENTER_CONFIRM_INPUT_TYPES = new Set([
  '',
  'date',
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

export function shouldConfirmClientFieldOnEnter({
  key,
  defaultPrevented = false,
  tagName,
  inputType = '',
} = {}) {
  if (key !== 'Enter' || defaultPrevented) return false;
  if (String(tagName ?? '').toUpperCase() !== 'INPUT') return false;
  return ENTER_CONFIRM_INPUT_TYPES.has(String(inputType ?? '').toLowerCase());
}

