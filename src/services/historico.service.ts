import { supabase } from '../lib/supabase';

export const CAMPOS_HISTORICO_RELEVANTES = [
  'regime_tributario',
  'responsavel',
  'revisor',
  'competencia_em_dia',
  'ultima_competencia_entregue',
  'situacao',
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
    throw new Error(`Nao foi possivel registrar historico: ${error.message}`);
  }

  return { ok: true, inserted: rows.length, skipped: CAMPOS_HISTORICO_RELEVANTES.length - rows.length };
}

export async function listarHistoricoPorCliente(clienteId: string) {
  const { data, error } = await supabase
    .from('historico_alteracoes')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data_alteracao', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Nao foi possivel carregar historico do cliente: ${error.message}`);
  }

  return data ?? [];
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
    throw new Error(`Nao foi possivel registrar evento no historico: ${error.message}`);
  }

  return { ok: true };
}
