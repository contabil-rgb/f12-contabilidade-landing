import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldConfirmClientFieldOnEnter } from './client-modal-keyboard.js';

test('confirma campos de texto e numero ao pressionar Enter', () => {
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Enter', tagName: 'input', inputType: 'text' }), true);
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Enter', tagName: 'INPUT', inputType: 'number' }), true);
});

test('preserva Enter em textarea e controles com acao propria', () => {
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Enter', tagName: 'textarea' }), false);
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Enter', tagName: 'input', inputType: 'file' }), false);
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Enter', tagName: 'button' }), false);
});

test('respeita eventos ja tratados por um campo especializado', () => {
  assert.equal(shouldConfirmClientFieldOnEnter({
    key: 'Enter',
    defaultPrevented: true,
    tagName: 'input',
    inputType: 'text',
  }), false);
});

test('nao interfere em outras teclas', () => {
  assert.equal(shouldConfirmClientFieldOnEnter({ key: 'Tab', tagName: 'input', inputType: 'text' }), false);
});

