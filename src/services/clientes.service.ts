import { supabase } from '../lib/supabase';

const DATE_FIELDS = new Set([
  'data_enviada_reinf',
  'data_entrega_ecd',
  'data_envio_ecd',
  'data_entrega_ata',
  'ultima_importacao',
  'data_envio_documentos',
  'data_notificacao_cliente',
  'data_retorno_cliente',
]);
const TIMESTAMP_FIELDS = new Set([
  'atualizado_em',
]);
const CLIENTE_FIELDS = new Set([
  'cnpj',
  'razao_social',
  'nome_identificacao',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'dificuldade',
  'lucro',
  'responsavel',
  'revisor',
  'primeira_competencia',
  'tem_folha',
  'ultima_importacao',
  'ultima_competencia_entregue',
  'situacao',
  'competencia_em_dia',
  'dias_atraso',
  'distribuicao_lucros',
  'envio_reinf',
  'data_enviada_reinf',
  'valor_lucro_acumulado',
  'precisa_ata',
  'ata_entregue',
  'data_entrega_ata',
  'ecd',
  'ultima_ecd_entregue',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'ecf',
  'ultima_ecf_entregue',
  'enviam_documentos',
  'modo_entrega',
  'curva_envio',
  'ultima_competencia_enviada',
  'data_envio_documentos',
  'revisado_coordenador',
  'lancamentos_padrao',
  'motivo_atraso',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
  'status',
  'atualizado_em',
]);

function normalizeCnpjDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatCnpjDigits(value: string) {
  const digits = normalizeCnpjDigits(value);
  if (digits.length !== 14) return digits;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toIsoDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function toIsoTimestamp(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function fromIsoDate(value: unknown) {
  const raw = String(value ?? '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return raw;
  return `${iso[3]}/${iso[2]}/${iso[1]}`;
}

function normalizePatch(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'criado_em') continue;
    if (!CLIENTE_FIELDS.has(key)) continue;
    if (TIMESTAMP_FIELDS.has(key)) {
      out[key] = toIsoTimestamp(value);
    } else if (DATE_FIELDS.has(key)) {
      out[key] = toIsoDate(value);
    } else if (key === 'dias_atraso') {
      out[key] = Number(value ?? 0) || 0;
    } else if (key === 'valor_lucro_acumulado') {
      const n = Number(String(value ?? '').replace(',', '.'));
      out[key] = Number.isFinite(n) ? n : null;
    } else if (value === '') {
      out[key] = null;
    } else {
      out[key] = value ?? null;
    }
  }
  return out;
}

function normalizeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of DATE_FIELDS) {
    out[key] = fromIsoDate(row[key]);
  }
  return out;
}

export async function listarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .or('status.is.null,status.eq.Ativo,status.neq.Inativo')
    .order('razao_social', { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar clientes do Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export async function buscarClientePorId(id: string) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível buscar cliente no Supabase: ${error.message}`);
  }
  if (!data) return null;
  return normalizeRow(data as Record<string, unknown>);
}

export async function buscarClientePorCnpj(cnpj: string) {
  const digits = normalizeCnpjDigits(cnpj);
  if (!digits) return null;

  const candidates = [...new Set([formatCnpjDigits(digits), digits].filter(Boolean))];

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('cnpj', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`Não foi possível buscar cliente por CNPJ no Supabase: ${error.message}`);
    }

    if (data) {
      return normalizeRow(data as Record<string, unknown>);
    }
  }

  return null;
}

export async function listarClientesVinculadosResponsavel(valor: string, { incluirInativos = false } = {}) {
  const alvo = normalizeText(String(valor ?? ''));
  if (!alvo) return [];

  let query = supabase
    .from('clientes')
    .select('id, cnpj, nome_identificacao, razao_social, responsavel, responsavel_ecd, status, situacao');

  if (!incluirInativos) {
    query = query.or('status.is.null,status.eq.Ativo,status.neq.Inativo');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível verificar vínculos do responsável: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => normalizeRow(row as Record<string, unknown>))
    .filter((row) =>
      normalizeText(String(row.responsavel ?? '')) === alvo
      || normalizeText(String(row.responsavel_ecd ?? '')) === alvo,
    );
}

export async function criarCliente(cliente: Record<string, unknown>) {
  const payload = normalizePatch(cliente);
  delete payload.id;
  delete payload.atualizado_em;

  const { data, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Não foi possível criar cliente no Supabase: ${error.message}`);
  }
  return normalizeRow(data as Record<string, unknown>);
}

export async function atualizarCliente(id: string, dados: Record<string, unknown>) {
  const payload = normalizePatch({
    ...dados,
    atualizado_em: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Não foi possível atualizar cliente no Supabase: ${error.message}`);
  }
  return normalizeRow(data as Record<string, unknown>);
}

export async function inativarCliente(id: string) {
  return atualizarCliente(id, { status: 'Inativo' });
}
