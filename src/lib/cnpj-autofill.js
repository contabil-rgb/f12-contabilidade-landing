import { normalizeCnpjDigits } from './cnpj.js';

function asText(value) {
  return String(value ?? '').trim();
}

export function applyCnpjAutofill(currentForm, expectedCnpj, company) {
  if (normalizeCnpjDigits(currentForm?.cnpj) !== normalizeCnpjDigits(expectedCnpj)) {
    return currentForm;
  }

  const razaoSocial = asText(currentForm?.razao_social)
    || asText(company?.razaoSocial);
  const nomeIdentificacao = asText(currentForm?.nome_identificacao)
    || asText(company?.nomeIdentificacao)
    || asText(company?.nomeFantasia)
    || razaoSocial;

  if (
    razaoSocial === currentForm?.razao_social
    && nomeIdentificacao === currentForm?.nome_identificacao
  ) {
    return currentForm;
  }

  return {
    ...currentForm,
    razao_social: razaoSocial,
    nome_identificacao: nomeIdentificacao,
  };
}
