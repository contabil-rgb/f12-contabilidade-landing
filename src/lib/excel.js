import * as XLSX from 'xlsx';
import {
  createDefaultLists,
  EXCEL_HEADER_MAP,
  FIELD_DEFINITIONS,
  LIST_HEADER_MAP,
} from '../data/schema.js';
import { formatCnpj, normalizeCnpj, normalizeText, todayBr, uniqueValues } from './formatters.js';

const BASE_SHEET_NAME = 'Base';
const LIST_SHEET_NAME = 'Listagens';
const LIST_SHEET_ALIASES = ['Listagens', 'Instrucoes', 'Instruções'];
const BASE_HEADER_ROW_CANDIDATES = [0, 1, 2, 3];
const LIST_HEADER_ROW = 0;
const REQUIRED_BASE_FIELDS = ['cnpj', 'razao_social', 'tipo_cliente', 'regime_tributario', 'atividades'];
const REQUIRED_BASE_FIELD_LABELS = {
  cnpj: 'CNPJ',
  razao_social: 'Razao Social',
  tipo_cliente: 'Tipo de Cliente',
  regime_tributario: 'Regime Tributario',
  atividades: 'Atividade',
};

const EXTRA_BASE_HEADER_MAP = {
  cnpj: 'cnpj',
  'razao social': 'razao_social',
  nome: 'nome_identificacao',
  'nome identificacao': 'nome_identificacao',
  'nome/identificacao': 'nome_identificacao',
  'tipo de cliente': 'tipo_cliente',
  'regime tributario': 'regime_tributario',
  atividade: 'atividades',
  'atividade principal': 'atividades',
  atividades: 'atividades',
  dificuldade: 'dificuldade',
  'distribuicao de lucros': 'distribuicao_lucros',
  lucro: 'lucro',
  'lucro?': 'lucro',
  'envio de reinf': 'envio_reinf',
  'data enviada': 'data_enviada_reinf',
  'valor lucro acumulado': 'valor_lucro_acumulado',
  ecd: 'ecd',
  'ultima ecd entregue': 'ultima_ecd_entregue',
  'data de entrega da ecd': 'data_entrega_ecd',
  'data enviada da ecd': 'data_envio_ecd',
  'responsavel pela ecd': 'responsavel_ecd',
  ecf: 'ecf',
  'ultima ecf entregue': 'ultima_ecf_entregue',
  responsavel: 'responsavel',
  revisor: 'revisor',
  'primeira competencia': 'primeira_competencia',
  'tem folha?': 'tem_folha',
  'ultima importacao': 'ultima_importacao',
  'ultima competencia entregue': 'ultima_competencia_entregue',
  'competencia em dia': 'competencia_em_dia',
  'competencia em dia?': 'competencia_em_dia',
  'dias de atraso': 'dias_atraso',
  situacao: 'situacao',
  'enviam documentos': 'enviam_documentos',
  'modo de entrega': 'modo_entrega',
  'curva de envio': 'curva_envio',
  'ultima competencia enviada': 'ultima_competencia_enviada',
  'data de envio': 'data_envio_documentos',
  'pendencias/observacoes': 'pendencias_observacoes',
  'pendencias observacoes': 'pendencias_observacoes',
  'pendencias e observacoes': 'pendencias_observacoes',
  'pendencias / observacoes': 'pendencias_observacoes',
  'revisado pelo coordenador': 'revisado_coordenador',
  'lancamentos padrao': 'lancamentos_padrao',
  'motivo do atraso': 'motivo_atraso',
  'pendencia tecnica': 'pendencia_tecnica',
  'cliente notificado': 'cliente_notificado',
  'data da notificacao': 'data_notificacao_cliente',
  'status do retorno': 'status_retorno_cliente',
  'data do retorno': 'data_retorno_cliente',
};

function normalizeHeader(header) {
  return normalizeText(header).replace(/\s+/g, ' ').trim();
}

const NORMALIZED_HEADER_MAP = (() => {
  const map = new Map();
  Object.entries(EXCEL_HEADER_MAP).forEach(([header, fieldKey]) => {
    map.set(normalizeHeader(header), fieldKey);
  });
  Object.entries(EXTRA_BASE_HEADER_MAP).forEach(([header, fieldKey]) => {
    map.set(normalizeHeader(header), fieldKey);
  });
  return map;
})();

function cellValue(cell, fieldKey) {
  if (!cell || cell.t === 'z') return '';

  if (fieldKey === 'cnpj') {
    const digits = normalizeCnpj(cell.v ?? cell.w ?? '');
    return digits ? formatCnpj(digits) : '';
  }

  if (cell.t === 'd' && cell.v instanceof Date) {
    return new Intl.DateTimeFormat('pt-BR').format(cell.v);
  }

  if (typeof cell.v === 'number' && fieldKey?.includes('data')) {
    try {
      return XLSX.SSF.format('dd/mm/yyyy', cell.v);
    } catch {
      return String(cell.w ?? cell.v ?? '').trim();
    }
  }

  const value = cell.w ?? cell.v ?? '';
  return String(value).trim();
}

function readHeaders(sheet, rowIndex) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const headers = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    const rawHeader = cellValue(sheet[address]).replace(/\s+/g, ' ').trim();
    headers.push(rawHeader);
  }
  return headers;
}

function resolveBaseHeaderField(header) {
  if (!header) return '';
  if (EXCEL_HEADER_MAP[header]) return EXCEL_HEADER_MAP[header];
  return NORMALIZED_HEADER_MAP.get(normalizeHeader(header)) || '';
}

function resolveBaseHeaders(sheet, baseRange) {
  const headersDefault = readHeaders(sheet, 0);
  let fallback = { headers: headersDefault, rowIndex: 0, mappedCount: 0 };

  for (const rowIndex of BASE_HEADER_ROW_CANDIDATES) {
    if (rowIndex > baseRange.e.r) continue;
    const headers = readHeaders(sheet, rowIndex);
    const mappedHeaderKeys = new Set(headers.map((header) => resolveBaseHeaderField(header)).filter(Boolean));
    const mappedCount = mappedHeaderKeys.size;
    if (mappedCount > fallback.mappedCount) {
      fallback = { headers, rowIndex, mappedCount };
    }

    const hasRequired = REQUIRED_BASE_FIELDS.every((field) => mappedHeaderKeys.has(field));
    if (hasRequired) {
      return { headers, rowIndex, mappedHeaderKeys };
    }
  }

  const mappedHeaderKeys = new Set(fallback.headers.map((header) => resolveBaseHeaderField(header)).filter(Boolean));
  return { headers: fallback.headers, rowIndex: fallback.rowIndex, mappedHeaderKeys };
}

export function parseContabilidadeWorkbook(workbook, source = 'Base Contabilidade Oficial.xlsx') {
  const baseSheet = workbook.Sheets[BASE_SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]];
  const listSheet = LIST_SHEET_ALIASES.map((sheetName) => workbook.Sheets[sheetName]).find(Boolean) ?? workbook.Sheets[LIST_SHEET_NAME];
  if (!baseSheet) {
    throw new Error('A planilha não possui uma aba de base legível.');
  }

  const baseRange = XLSX.utils.decode_range(baseSheet['!ref'] || 'A1:A1');
  const { headers, rowIndex: headerRowIndex, mappedHeaderKeys } = resolveBaseHeaders(baseSheet, baseRange);
  const missingRequiredFields = REQUIRED_BASE_FIELDS.filter((field) => !mappedHeaderKeys.has(field));
  if (missingRequiredFields.length) {
    const labels = missingRequiredFields.map((field) => REQUIRED_BASE_FIELD_LABELS[field] ?? field);
    throw new Error(`Colunas obrigatorias ausentes na aba Base: ${labels.join(', ')}.`);
  }
  const now = todayBr();
  const clientsByCnpj = new Map();
  let totalRowsRead = 0;
  let skippedEmptyRows = 0;

  for (let row = headerRowIndex + 1; row <= baseRange.e.r; row += 1) {
    totalRowsRead += 1;
    const client = FIELD_DEFINITIONS.reduce((acc, field) => {
      acc[field.key] = '';
      return acc;
    }, {});

    headers.forEach((header, col) => {
      const fieldKey = resolveBaseHeaderField(header);
      if (!fieldKey) return;
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      client[fieldKey] = cellValue(baseSheet[address], fieldKey);
    });

    if (!client.cnpj && !client.razao_social && !client.nome_identificacao) {
      skippedEmptyRows += 1;
      continue;
    }

    const cnpjDigits = normalizeCnpj(client.cnpj);
    const id = cnpjDigits ? `cliente-${cnpjDigits}` : `cliente-linha-${row + 1}`;
    const normalized = {
      ...client,
      id,
      cnpj: cnpjDigits ? formatCnpj(cnpjDigits) : client.cnpj,
      cnpj_digitos: cnpjDigits,
      linha_origem: row + 1,
      fonte_planilha: source,
      criado_em: client.criado_em || now,
      atualizado_em: now,
    };

    if (cnpjDigits) {
      clientsByCnpj.set(cnpjDigits, { ...(clientsByCnpj.get(cnpjDigits) ?? {}), ...normalized });
    } else {
      clientsByCnpj.set(id, normalized);
    }
  }

  return {
    clientes: Array.from(clientsByCnpj.values()),
    listagens: mergeLists(parseListagens(listSheet), Array.from(clientsByCnpj.values())),
    metadata: {
      source,
      importedAt: now,
      baseRows: Array.from(clientsByCnpj.values()).length,
      totalRowsRead,
      skippedEmptyRows,
      sheets: workbook.SheetNames,
    },
  };
}

export function parseListagens(sheet) {
  const lists = createDefaultLists();
  if (!sheet) return lists;

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const headers = readHeaders(sheet, LIST_HEADER_ROW);

  headers.forEach((header, col) => {
    const listKey = LIST_HEADER_MAP[header];
    if (!listKey) return;

    const values = [];
    for (let row = LIST_HEADER_ROW + 1; row <= range.e.r; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const value = cellValue(sheet[address]);
      if (value) values.push(value);
    }

    lists[listKey] = uniqueValues([...(lists[listKey] ?? []), ...values]);
  });

  return lists;
}

export function mergeLists(lists, clients) {
  const merged = { ...createDefaultLists(), ...lists };
  const listFields = FIELD_DEFINITIONS.filter((field) => field.listKey);
  listFields.forEach((field) => {
    merged[field.listKey] = uniqueValues([
      ...(merged[field.listKey] ?? []),
      ...clients.map((client) => client[field.key]),
    ]);
  });
  return merged;
}

export function workbookFromArrayBuffer(buffer, source) {
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    cellText: true,
    cellNF: true,
  });
  return parseContabilidadeWorkbook(workbook, source);
}

export function clientsToExportRows(clients) {
  return clients.map((client) => {
    const row = {};
    FIELD_DEFINITIONS.forEach((field) => {
      row[field.label] = client[field.key] ?? '';
    });
    return row;
  });
}

export function exportClientsToXlsx(clients, filename = 'clientes-contabeis.xlsx') {
  const rows = clientsToExportRows(clients);
  exportRowsToXlsx(rows, filename, 'Base');
}

export function exportClientsToCsv(clients, filename = 'clientes-contabeis.csv') {
  exportRowsToCsv(clientsToExportRows(clients), filename);
}

export function exportRowsToXlsx(rows, filename = 'relatorio.xlsx', sheetName = 'Relatório') {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export function exportRowsToCsv(rows, filename = 'relatorio.csv') {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { XLSX };
