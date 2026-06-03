import { supabase } from '../lib/supabase';

export type FollowupsResumoClienteRow = {
  cliente_id: string;
  cnpj?: string | null;
  razao_social?: string | null;
  nome_identificacao?: string | null;
  total_followups?: number | null;
  followups_abertos?: number | null;
  followups_concluidos?: number | null;
  followups_cancelados?: number | null;
  followups_aguardando_retorno?: number | null;
  followups_atrasados?: number | null;
  followups_proximos?: number | null;
  ultimo_followup_id?: string | null;
  ultimo_followup_tipo?: string | null;
  ultimo_followup_status?: string | null;
  ultimo_followup_data_contato?: string | null;
  ultimo_followup_criado_em?: string | null;
  proximo_followup_id?: string | null;
  proximo_followup_tipo?: string | null;
  proximo_followup_status?: string | null;
  proximo_followup_prioridade?: string | null;
  proximo_followup_data_prevista?: string | null;
  proximo_followup_proxima_acao?: string | null;
  proximo_followup_descricao?: string | null;
  proximo_followup_responsavel_usuario_id?: string | null;
  proximo_followup_responsavel_nome?: string | null;
  proximo_followup_responsavel_email?: string | null;
  dias_para_proximo_followup?: number | null;
  followup_pendente?: boolean | null;
  status_followup_codigo?: string | null;
  status_followup_label?: string | null;
};

const NUMBER_FIELDS = [
  'total_followups',
  'followups_abertos',
  'followups_concluidos',
  'followups_cancelados',
  'followups_aguardando_retorno',
  'followups_atrasados',
  'followups_proximos',
  'dias_para_proximo_followup',
] as const;

function normalizeResumoRow(row: Record<string, unknown>) {
  const normalized = { ...row } as Record<string, unknown>;

  for (const field of NUMBER_FIELDS) {
    const value = row[field];
    if (value === null || value === undefined || value === '') {
      normalized[field] = null;
      continue;
    }

    const numeric = Number(value);
    normalized[field] = Number.isFinite(numeric) ? numeric : null;
  }

  return normalized as FollowupsResumoClienteRow;
}

export async function listarFollowupsResumoClientes() {
  const { data, error } = await supabase
    .from('vw_clientes_followups_resumo')
    .select('*');

  if (error) {
    throw new Error(`Nao foi possivel carregar resumo de follow-ups: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeResumoRow(row as Record<string, unknown>));
}

export function indexarFollowupsResumo(rows: FollowupsResumoClienteRow[]) {
  return (rows ?? []).reduce<Record<string, FollowupsResumoClienteRow>>((acc, row) => {
    const clienteId = String(row.cliente_id ?? '').trim();
    if (!clienteId) return acc;
    acc[clienteId] = row;
    return acc;
  }, {});
}
