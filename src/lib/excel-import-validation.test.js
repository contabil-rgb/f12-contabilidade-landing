import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { mergeClienteRowForImport } from './clientes-sync.js';
import {
  EXCEL_IMPORT_LIMITS,
  isValidCnpj,
  validateExcelBuffer,
  validateExcelFileMetadata,
  validateWorkbookDimensions,
} from './excel-import-validation.js';
import { workbookFromArrayBuffer } from './excel.js';

test('valida extensão, tamanho e assinatura do arquivo antes da leitura', () => {
  assert.throws(
    () => validateExcelFileMetadata({ name: 'base.csv', size: 100 }),
    /Formato não permitido/,
  );
  assert.throws(
    () => validateExcelFileMetadata({ name: 'base.xlsx', size: EXCEL_IMPORT_LIMITS.maxFileBytes + 1 }),
    /10 MB/,
  );
  assert.throws(
    () => validateExcelBuffer(new Uint8Array([1, 2, 3, 4]).buffer, 'base.xlsx'),
    /não corresponde/,
  );
});

test('valida os dígitos verificadores do CNPJ', () => {
  assert.equal(isValidCnpj('98.765.432/0001-98'), true);
  assert.equal(isValidCnpj('98.765.432/0001-99'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(isValidCnpj('123'), false);
});

test('bloqueia dimensões de planilha acima dos limites', () => {
  const workbook = {
    SheetNames: ['Base'],
    Sheets: { Base: { '!ref': `A1:A${EXCEL_IMPORT_LIMITS.maxRowsPerSheet + 1}` } },
  };
  assert.throws(
    () => validateWorkbookDimensions(workbook, XLSX.utils.decode_range),
    /excede o limite/,
  );
});

test('preserva dados existentes quando coluna está ausente ou célula está vazia', () => {
  const existing = {
    cnpj: '98.765.432/0001-98',
    razao_social: 'Empresa anterior',
    responsavel: 'Aline',
    regime_tributario: 'Simples Nacional',
    ultima_importacao: '2026-09-10',
    pendencias_observacoes: 'Manter esta observação',
    status: 'Ativo',
  };
  const imported = {
    cnpj: '98.765.432/0001-98',
    razao_social: 'Empresa atualizada',
    responsavel: '',
    regime_tributario: 'Lucro Presumido',
    ultima_importacao: 'data inválida',
  };

  const result = mergeClienteRowForImport(
    imported,
    existing,
    ['cnpj', 'razao_social', 'responsavel', 'regime_tributario', 'ultima_importacao'],
  );

  assert.equal(result.razao_social, 'Empresa atualizada');
  assert.equal(result.regime_tributario, 'Lucro Presumido');
  assert.equal(result.responsavel, 'Aline');
  assert.equal(result.pendencias_observacoes, 'Manter esta observação');
  assert.equal(result.ultima_importacao, '2026-09-10');
});

test('contabiliza CNPJ inválido e duplicado durante a leitura', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['CNPJ', 'Razão Social', 'Tipo de Cliente', 'Regime Tributário', 'Atividade'],
    ['98.765.432/0001-98', 'Primeira versão', 'Tambaqui', 'Simples Nacional', 'Serviço'],
    ['98.765.432/0001-98', 'Última versão', 'Tambaqui', 'Simples Nacional', 'Serviço'],
    ['12.345.678/0001-99', 'CNPJ inválido', 'Tambaqui', 'Simples Nacional', 'Serviço'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Base');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const parsed = workbookFromArrayBuffer(buffer, 'base.xlsx');

  assert.equal(parsed.clientes.length, 1);
  assert.equal(parsed.clientes[0].razao_social, 'Última versão');
  assert.equal(parsed.metadata.duplicateRowsCount, 1);
  assert.equal(parsed.metadata.invalidRowsCount, 1);
});
