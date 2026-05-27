import { formatCnpj, normalizeCnpj } from '../lib/formatters.js';
import { supabase } from '../lib/supabase';

const BATCH_SIZE = 200;
const CLIENT_DB_FIELDS = [
  'cnpj',
  'razao_social',
  'nome_identificacao',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'responsavel',
  'revisor',
  'situacao',
  'competencia_em_dia',
  'dias_atraso',
  'distribuicao_lucros',
  'envio_reinf',
  'data_enviada_reinf',
  'valor_lucro_acumulado',
  'ecd',
  'ultima_ecd_entregue',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'ecf',
  'ultima_ecf_entregue',
  'pendencia_tecnica',
  'cliente_notificado',
  'proxima_acao',
  'status',
  'atualizado_em',
];

function toIsoDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

async function workbookFromBuffer(buffer, source) {
  const { workbookFromArrayBuffer } = await import('../lib/excel.js');
  return workbookFromArrayBuffer(buffer, source);
}

function toBatch(items, size = BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function normalizeClienteRow(input) {
  const cnpjDigits = normalizeCnpj(input.cnpj);
  const cnpj = cnpjDigits ? formatCnpj(cnpjDigits) : null;
  const razaoSocial = normalizeString(input.razao_social);
  if (!cnpj || !razaoSocial) return null;

  const payload = {
    cnpj,
    razao_social: razaoSocial,
    nome_identificacao: normalizeString(input.nome_identificacao),
    tipo_cliente: normalizeString(input.tipo_cliente),
    regime_tributario: normalizeString(input.regime_tributario),
    atividades: normalizeString(input.atividades),
    responsavel: normalizeString(input.responsavel),
    revisor: normalizeString(input.revisor),
    situacao: normalizeString(input.situacao),
    competencia_em_dia: normalizeString(input.competencia_em_dia),
    dias_atraso: Number(input.dias_atraso ?? 0) || 0,
    distribuicao_lucros: normalizeString(input.distribuicao_lucros),
    envio_reinf: normalizeString(input.envio_reinf),
    data_enviada_reinf: toIsoDate(input.data_enviada_reinf),
    valor_lucro_acumulado: parseMoney(input.valor_lucro_acumulado),
    ecd: normalizeString(input.ecd),
    ultima_ecd_entregue: normalizeString(input.ultima_ecd_entregue),
    data_entrega_ecd: toIsoDate(input.data_entrega_ecd),
    data_envio_ecd: toIsoDate(input.data_envio_ecd),
    responsavel_ecd: normalizeString(input.responsavel_ecd),
    ecf: normalizeString(input.ecf),
    ultima_ecf_entregue: normalizeString(input.ultima_ecf_entregue),
    pendencia_tecnica: normalizeString(input.pendencia_tecnica),
    cliente_notificado: normalizeString(input.cliente_notificado),
    proxima_acao: normalizeString(input.proxima_acao),
    status: normalizeString(input.status) || 'Ativo',
    atualizado_em: new Date().toISOString(),
  };

  const sanitized = {};
  CLIENT_DB_FIELDS.forEach((field) => {
    sanitized[field] = payload[field] ?? null;
  });
  return sanitized;
}

async function existingCnpjSet(cnpjs) {
  if (!cnpjs.length) return new Set();
  const { data, error } = await supabase
    .from('clientes')
    .select('cnpj')
    .in('cnpj', cnpjs);
  if (error) {
    throw new Error(`Falha ao consultar CNPJs existentes: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => String(row.cnpj ?? '').trim()));
}

export async function sincronizarClientesRows(rows, sourceLabel = 'sincronizacao', options = {}) {
  const apply = options.apply !== false;
  const errors = [];
  const preparedRows = [];
  let ignored = 0;

  for (const row of rows) {
    const prepared = normalizeClienteRow(row);
    if (!prepared) {
      ignored += 1;
      continue;
    }
    preparedRows.push(prepared);
  }

  const uniqueMap = new Map();
  preparedRows.forEach((row) => uniqueMap.set(row.cnpj, row));
  const dedupedRows = [...uniqueMap.values()];

  if (!dedupedRows.length) {
    return {
      ok: false,
      summary: {
        source: sourceLabel,
        totalLinhasLidas: rows.length,
        totalConsideradas: 0,
        criados: 0,
        atualizados: 0,
        ignorados: ignored,
        erros: 1,
      },
      errors: ['Nenhum cliente valido para importacao (CNPJ e Razao Social sao obrigatorios).'],
      rows: [],
    };
  }

  const cnpjList = dedupedRows.map((row) => row.cnpj);
  const existed = await existingCnpjSet(cnpjList);
  const created = dedupedRows.filter((row) => !existed.has(row.cnpj)).length;
  const updated = dedupedRows.length - created;

  if (apply) {
    for (const batch of toBatch(dedupedRows)) {
      const { error } = await supabase
        .from('clientes')
        .upsert(batch, { onConflict: 'cnpj' });
      if (error) {
        errors.push(`Falha ao gravar lote (${batch.length} registros): ${error.message}`);
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      source: sourceLabel,
      apply,
      totalLinhasLidas: rows.length,
      totalConsideradas: dedupedRows.length,
      criados: errors.length ? 0 : created,
      atualizados: errors.length ? 0 : updated,
      ignorados: ignored + (preparedRows.length - dedupedRows.length),
      erros: errors.length,
    },
    errors,
    rows: dedupedRows,
  };
}

export async function importarClientesExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, { apply: true });
  return {
    ...result,
    payload,
  };
}

export async function previsualizarImportacaoExcel(arrayBuffer, fileName = 'importacao.xlsx') {
  const payload = await workbookFromBuffer(arrayBuffer, fileName);
  const result = await sincronizarClientesRows(payload.clientes ?? [], fileName, { apply: false });
  return {
    ...result,
    payload,
  };
}
