import { normalizeCnpjDigits } from './cnpj.js';

function asText(value) {
  return String(value ?? '').trim();
}

export function applyCnpjAutofill(currentForm, expectedCnpj, company, { replaceExisting = false } = {}) {
  if (normalizeCnpjDigits(currentForm?.cnpj) !== normalizeCnpjDigits(expectedCnpj)) {
    return currentForm;
  }

  const companyLegalName = asText(company?.razaoSocial);
  const companyDisplayName = asText(company?.nomeIdentificacao)
    || asText(company?.nomeFantasia)
    || companyLegalName;
  const razaoSocial = replaceExisting
    ? companyLegalName
    : asText(currentForm?.razao_social) || companyLegalName;
  const nomeIdentificacao = replaceExisting
    ? companyDisplayName
    : asText(currentForm?.nome_identificacao) || companyDisplayName || razaoSocial;

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
