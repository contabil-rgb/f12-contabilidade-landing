import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCnpjAutofill } from './cnpj-autofill.js';

const cnpj = '98.765.432/0001-98';
const company = {
  cnpj: '98765432000198',
  razaoSocial: 'Empresa F12 Ltda',
  nomeFantasia: 'F12 Serviços',
  nomeIdentificacao: 'F12 Serviços',
  provedor: 'CNPJ.ws',
  atualizadoEm: null,
};

test('preenche somente razao social e nome de identificacao vazios', () => {
  const current = {
    cnpj,
    razao_social: '',
    nome_identificacao: '',
    status: 'Início de contrato',
    tipo_cliente: 'Matriz',
    regime_tributario: 'Simples Nacional',
  };

  assert.deepEqual(applyCnpjAutofill(current, company.cnpj, company), {
    ...current,
    razao_social: 'Empresa F12 Ltda',
    nome_identificacao: 'F12 Serviços',
  });
});

test('preserva valores que o colaborador ja preencheu', () => {
  const current = {
    cnpj,
    razao_social: 'Razão revisada manualmente',
    nome_identificacao: 'Nome interno do escritório',
    dificuldade: 'Alta',
  };

  assert.strictEqual(applyCnpjAutofill(current, company.cnpj, company), current);
});

test('usa razao social como fallback do nome', () => {
  const current = { cnpj, razao_social: '', nome_identificacao: '' };
  const withoutFantasyName = {
    ...company,
    nomeFantasia: '',
    nomeIdentificacao: '',
  };

  const result = applyCnpjAutofill(current, company.cnpj, withoutFantasyName);
  assert.equal(result.razao_social, 'Empresa F12 Ltda');
  assert.equal(result.nome_identificacao, 'Empresa F12 Ltda');
});

test('descarta resposta de uma consulta anterior se o CNPJ mudou', () => {
  const current = {
    cnpj: '11.444.777/0001-61',
    razao_social: '',
    nome_identificacao: '',
  };

  assert.strictEqual(applyCnpjAutofill(current, company.cnpj, company), current);
});
