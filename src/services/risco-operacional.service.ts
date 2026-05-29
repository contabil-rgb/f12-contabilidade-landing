import { supabase } from '../lib/supabase';

export type RiscoOperacionalClienteRow = {
  cliente_id: string;
  cnpj?: string | null;
  razao_social?: string | null;
  nome_identificacao?: string | null;
  dias_atraso?: number | null;
  competencia_em_dia_bool?: boolean | null;
  em_atraso?: boolean | null;
  situacao_critica?: boolean | null;
  pendencia_tecnica?: boolean | null;
  documentos_atrasados?: boolean | null;
  has_pendencia?: boolean | null;
  risco_codigo?: string | null;
  risco_label?: string | null;
  comunicacao_pendente?: boolean | null;
  pendencia_critica?: boolean | null;
  pendencias_obrigacoes_total?: number | null;
};

function normalizeRiscoRow(row: Record<string, unknown>) {
  return {
    ...row,
    dias_atraso: Number(row.dias_atraso ?? 0) || 0,
    pendencias_obrigacoes_total: Number(row.pendencias_obrigacoes_total ?? 0) || 0,
  } as RiscoOperacionalClienteRow;
}

export async function listarRiscoOperacionalClientes() {
  const { data, error } = await supabase
    .from('vw_clientes_risco_operacional')
    .select('*');

  if (error) {
    throw new Error(`Não foi possível carregar risco operacional: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeRiscoRow(row as Record<string, unknown>));
}

export function indexarRiscoOperacional(rows: RiscoOperacionalClienteRow[]) {
  return (rows ?? []).reduce<Record<string, RiscoOperacionalClienteRow>>((acc, row) => {
    const clienteId = String(row.cliente_id ?? '').trim();
    if (!clienteId) return acc;
    acc[clienteId] = row;
    return acc;
  }, {});
}
