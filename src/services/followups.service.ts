import { supabase } from '../lib/supabase';

const DATE_FIELDS = new Set([
  'data_contato',
  'data_prevista',
  'data_conclusao',
]);

const FOLLOWUP_FIELDS = new Set([
  'cliente_id',
  'criado_por',
  'responsavel_usuario_id',
  'tipo',
  'status',
  'prioridade',
  'canal',
  'origem',
  'descricao',
  'resultado',
  'proxima_acao',
  'data_contato',
  'data_prevista',
  'data_conclusao',
  'contexto_area',
  'contexto_chave',
  'atualizado_em',
]);

const FOLLOWUP_SELECT = `
  id,
  cliente_id,
  criado_por,
  responsavel_usuario_id,
  tipo,
  status,
  prioridade,
  canal,
  origem,
  descricao,
  resultado,
  proxima_acao,
  data_contato,
  data_prevista,
  data_conclusao,
  contexto_area,
  contexto_chave,
  criado_em,
  atualizado_em,
  criado_por_usuario:usuarios!clientes_followups_criado_por_fkey(id,nome,email),
  responsavel_usuario:usuarios!clientes_followups_responsavel_usuario_id_fkey(id,nome,email)
`;

function toIsoDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function normalizePatch(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!FOLLOWUP_FIELDS.has(key)) continue;
    if (DATE_FIELDS.has(key)) {
      out[key] = toIsoDate(value);
    } else if (value === '') {
      out[key] = null;
    } else {
      out[key] = value ?? null;
    }
  }
  return out;
}

function normalizeRow(row: Record<string, unknown>) {
  return {
    ...row,
    criado_por_usuario: row.criado_por_usuario ?? null,
    responsavel_usuario: row.responsavel_usuario ?? null,
  };
}

export async function listarFollowupsPorCliente(clienteId: string) {
  const { data, error } = await supabase
    .from('clientes_followups')
    .select(FOLLOWUP_SELECT)
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar follow-ups do cliente: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export async function criarFollowup(dados: Record<string, unknown>) {
  const payload = normalizePatch(dados);
  const { data, error } = await supabase
    .from('clientes_followups')
    .insert(payload)
    .select(FOLLOWUP_SELECT)
    .single();

  if (error) {
    throw new Error(`Nao foi possivel criar follow-up no Supabase: ${error.message}`);
  }

  return normalizeRow(data as Record<string, unknown>);
}

export async function atualizarFollowup(id: string, dados: Record<string, unknown>) {
  const payload = normalizePatch({
    ...dados,
    atualizado_em: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from('clientes_followups')
    .update(payload)
    .eq('id', id)
    .select(FOLLOWUP_SELECT)
    .single();

  if (error) {
    throw new Error(`Nao foi possivel atualizar follow-up no Supabase: ${error.message}`);
  }

  return normalizeRow(data as Record<string, unknown>);
}
