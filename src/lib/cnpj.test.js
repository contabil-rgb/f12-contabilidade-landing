import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCnpjValidationError,
  isValidCnpj,
  normalizeCnpjDigits,
} from './cnpj.js';

test('normaliza CNPJ com ou sem máscara', () => {
  assert.equal(normalizeCnpjDigits('98.765.432/0001-98'), '98765432000198');
  assert.equal(normalizeCnpjDigits('98765432000198'), '98765432000198');
});

test('valida os dois dígitos verificadores do CNPJ', () => {
  assert.equal(isValidCnpj('98.765.432/0001-98'), true);
  assert.equal(isValidCnpj('98765432000198'), true);
  assert.equal(isValidCnpj('98.765.432/0001-08'), false);
  assert.equal(isValidCnpj('98.765.432/0001-99'), false);
});

test('rejeita tamanho incorreto, sequência repetida e caracteres indevidos', () => {
  assert.equal(isValidCnpj('123'), false);
  assert.equal(isValidCnpj(''), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj('98.765.432/0001-98A'), false);
});

test('diferencia CNPJ incompleto de dígitos verificadores inválidos', () => {
  assert.equal(getCnpjValidationError('123'), 'CNPJ deve ter 14 dígitos.');
  assert.equal(
    getCnpjValidationError('98.765.432/0001-99'),
    'CNPJ inválido. Confira os dígitos informados.',
  );
  assert.equal(getCnpjValidationError('98.765.432/0001-98'), '');
});

test('preserva edição de cliente legado enquanto o CNPJ não for alterado', () => {
  const options = {
    originalValue: '11.111.111/1111-11',
    allowUnchangedInvalid: true,
  };

  assert.equal(getCnpjValidationError('11.111.111/1111-11', options), '');
  assert.equal(
    getCnpjValidationError('11.111.111/1111-12', options),
    'CNPJ inválido. Confira os dígitos informados.',
  );
  assert.equal(getCnpjValidationError('', {
    originalValue: '',
    allowUnchangedInvalid: true,
  }), '');
});
