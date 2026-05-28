import { supabase } from '../lib/supabase';

export type ObrigacoesClienteRow = {
  cliente_id: string;
  reinf_status_codigo?: string | null;
  reinf_status_label?: string | null;
  reinf_pendente?: boolean | null;
  recibo_reinf_pendente?: boolean | null;
  reinf_data_entrega?: string | null;
  reinf_data_enviada?: string | null;
  reinf_comprovante_anexado?: boolean | null;
  ecd_status_codigo?: string | null;
  ecd_status_label?: string | null;
  ecd_pendente?: boolean | null;
  ecd_aguardando_envio?: boolean | null;
  ecd_responsavel_pendente?: boolean | null;
  recibo_ecd_pendente?: boolean | null;
  ecd_comprovante_anexado?: boolean | null;
  ecf_status_codigo?: string | null;
  ecf_status_label?: string | null;
  ecf_pendente?: boolean | null;
  recibo_ecf_pendente?: boolean | null;
  ecf_comprovante_anexado?: boolean | null;
  obrigacoes_status_codigo?: string | null;
  obrigacoes_status_label?: string | null;
  comunicacao_pendente?: boolean | null;
  pendencia_critica?: boolean | null;
  possui_pendencia_obrigacao?: boolean | null;
  pendencias_obrigacoes_total?: number | null;
};

function normalizeObrigacaoRow(row: Record<string, unknown>) {
  return {
    ...row,
    pendencias_obrigacoes_total: Number(row.pendencias_obrigacoes_total ?? 0) || 0,
  } as ObrigacoesClienteRow;
}

export async function listarStatusObrigacoesClientes() {
  const { data, error } = await supabase
    .from('vw_clientes_obrigacoes_status')
    .select('*');

  if (error) {
    throw new Error(`Nao foi possivel carregar status das obrigacoes: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeObrigacaoRow(row as Record<string, unknown>));
}

export function indexarStatusObrigacoes(rows: ObrigacoesClienteRow[]) {
  return (rows ?? []).reduce<Record<string, ObrigacoesClienteRow>>((acc, row) => {
    const clienteId = String(row.cliente_id ?? '').trim();
    if (!clienteId) return acc;
    acc[clienteId] = row;
    return acc;
  }, {});
}
