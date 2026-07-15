import { normalizeText } from './formatters.js';

export const ECD_ECF_REGIMES = ['lucro presumido', 'lucro real'];

export function isRegimeEcdEcfAplicavel(regimeTributario) {
  return ECD_ECF_REGIMES.includes(normalizeText(regimeTributario));
}

export function sanitizeResponsavelEcdByRegime(cliente) {
  if (!cliente || isRegimeEcdEcfAplicavel(cliente.regime_tributario)) {
    return cliente;
  }

  if (cliente.responsavel_ecd === null || cliente.responsavel_ecd === undefined || cliente.responsavel_ecd === '') {
    return cliente;
  }

  return {
    ...cliente,
    responsavel_ecd: null,
  };
}
