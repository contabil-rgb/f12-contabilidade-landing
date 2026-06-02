import { supabase } from '../lib/supabase';

export type AcompanhamentoOperacionalClienteRow = {
  cliente_id: string;
  cnpj?: string | null;
  razao_social?: string | null;
  nome_identificacao?: string | null;
  cliente_notificado_bool?: boolean | null;
  data_notificacao_cliente?: string | null;
  status_retorno_cliente?: string | null;
  data_retorno_cliente?: string | null;
  proxima_acao?: string | null;
  prazo_proxima_acao?: string | null;
  retorno_recebido?: boolean | null;
  aguardando_retorno?: boolean | null;
  sem_retorno?: boolean | null;
  prazo_proxima_acao_vencido?: boolean | null;
  prazo_proxima_acao_proximo?: boolean | null;
  acompanhamento_pendente?: boolean | null;
  dias_sem_retorno?: number | null;
  dias_para_prazo?: number | null;
  status_acompanhamento_codigo?: string | null;
  status_acompanhamento_label?: string | null;
};

function normalizeAcompanhamentoRow(row: Record<string, unknown>) {
  const toNullableNumber = (value: unknown) =>
    value === null || value === undefined || value === '' ? null : Number(value);

  const diasSemRetorno = toNullableNumber(row.dias_sem_retorno);
  const diasParaPrazo = toNullableNumber(row.dias_para_prazo);

  return {
    ...row,
    dias_sem_retorno: Number.isFinite(diasSemRetorno) ? diasSemRetorno : null,
    dias_para_prazo: Number.isFinite(diasParaPrazo) ? diasParaPrazo : null,
  } as AcompanhamentoOperacionalClienteRow;
}

export async function listarAcompanhamentoOperacionalClientes() {
  const { data, error } = await supabase
    .from('vw_clientes_acompanhamento_operacional')
    .select('*');

  if (error) {
    throw new Error(`Nao foi possivel carregar acompanhamento operacional: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeAcompanhamentoRow(row as Record<string, unknown>));
}

export function indexarAcompanhamentoOperacional(rows: AcompanhamentoOperacionalClienteRow[]) {
  return (rows ?? []).reduce<Record<string, AcompanhamentoOperacionalClienteRow>>((acc, row) => {
    const clienteId = String(row.cliente_id ?? '').trim();
    if (!clienteId) return acc;
    acc[clienteId] = row;
    return acc;
  }, {});
}
