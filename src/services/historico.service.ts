import { supabase } from '../lib/supabase';

export const CAMPOS_HISTORICO_RELEVANTES = [
  'regime_tributario',
  'dificuldade',
  'lucro',
  'responsavel',
  'revisor',
  'primeira_competencia',
  'tem_folha',
  'ultima_importacao',
  'competencia_em_dia',
  'ultima_competencia_entregue',
  'situacao',
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
];

function normalizeComparable(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function toTextValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value).trim();
  return text.length ? text : null;
}

function camposAlterados(
  antigos: Record<string, unknown>,
  novos: Record<string, unknown>,
  campos: string[],
) {
  return campos.filter((campo) => normalizeComparable(antigos?.[campo]) !== normalizeComparable(novos?.[campo]));
}

type UsuarioLogado = {
  id?: string;
  email?: string;
  nome?: string;
};

type RegistroEventoHistorico = {
  clienteId: string;
  usuarioLogado: UsuarioLogado;
  campoAlterado: string;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  tipoAcao?: string;
  origem?: string;
};

function normalizeHistoricoRow(row: Record<string, unknown>) {
  const clienteRelacionamento = row.cliente as Record<string, unknown> | null | undefined;
  const clienteNome =
    String(row.cliente_nome ?? '').trim()
    || String(clienteRelacionamento?.nome_identificacao ?? '').trim()
    || String(clienteRelacionamento?.razao_social ?? '').trim();

  return {
    ...row,
    cliente_nome: clienteNome,
  };
}

export async function registrarHistoricoAlteracoes(
  clienteId: string,
  valoresAntigos: Record<string, unknown>,
  valoresNovos: Record<string, unknown>,
  usuarioLogado: UsuarioLogado,
  tipoAcao = 'edicao_manual',
  origem = 'Portal',
) {
  if (!clienteId || !usuarioLogado?.id) {
    return { ok: false, inserted: 0, skipped: CAMPOS_HISTORICO_RELEVANTES.length };
  }

  const changedFields = camposAlterados(
    valoresAntigos ?? {},
    valoresNovos ?? {},
    CAMPOS_HISTORICO_RELEVANTES,
  );

  if (!changedFields.length) {
    return { ok: true, inserted: 0, skipped: CAMPOS_HISTORICO_RELEVANTES.length };
  }

  const rows = changedFields.map((campo) => ({
    cliente_id: clienteId,
    usuario_id: usuarioLogado.id,
    usuario_email: toTextValue(usuarioLogado.email),
    usuario_nome: toTextValue(usuarioLogado.nome),
    campo_alterado: campo,
    valor_anterior: toTextValue(valoresAntigos?.[campo]),
    valor_novo: toTextValue(valoresNovos?.[campo]),
    tipo_acao: toTextValue(tipoAcao),
    origem: toTextValue(origem),
  }));

  const { error } = await supabase.from('historico_alteracoes').insert(rows);

  if (error) {
    throw new Error(`Não foi possível registrar histórico: ${error.message}`);
  }

  return { ok: true, inserted: rows.length, skipped: CAMPOS_HISTORICO_RELEVANTES.length - rows.length };
}

export async function listarHistoricoPorCliente(clienteId: string) {
  const { data, error } = await supabase
    .from('historico_alteracoes')
    .select(`
      *,
      cliente:clientes!historico_alteracoes_cliente_id_fkey (
        id,
        nome_identificacao,
        razao_social
      )
    `)
    .eq('cliente_id', clienteId)
    .order('data_alteracao', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Não foi possível carregar histórico do cliente: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeHistoricoRow(row as Record<string, unknown>));
}

export async function listarHistoricoPortal(limit = 200) {
  const { data, error } = await supabase
    .from('historico_alteracoes')
    .select(`
      *,
      cliente:clientes!historico_alteracoes_cliente_id_fkey (
        id,
        nome_identificacao,
        razao_social
      )
    `)
    .order('data_alteracao', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`NÃ£o foi possÃ­vel carregar histÃ³rico geral do portal: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeHistoricoRow(row as Record<string, unknown>));
}

export async function registrarEventoHistorico({
  clienteId,
  usuarioLogado,
  campoAlterado,
  valorAnterior,
  valorNovo,
  tipoAcao = 'evento',
  origem = 'Portal',
}: RegistroEventoHistorico) {
  if (!clienteId || !usuarioLogado?.id || !campoAlterado) {
    return { ok: false };
  }

  const row = {
    cliente_id: clienteId,
    usuario_id: usuarioLogado.id,
    usuario_email: toTextValue(usuarioLogado.email),
    usuario_nome: toTextValue(usuarioLogado.nome),
    campo_alterado: campoAlterado,
    valor_anterior: toTextValue(valorAnterior),
    valor_novo: toTextValue(valorNovo),
    tipo_acao: toTextValue(tipoAcao),
    origem: toTextValue(origem),
  };

  const { error } = await supabase.from('historico_alteracoes').insert(row);
  if (error) {
    throw new Error(`Não foi possível registrar evento no histórico: ${error.message}`);
  }

  return { ok: true };
}
