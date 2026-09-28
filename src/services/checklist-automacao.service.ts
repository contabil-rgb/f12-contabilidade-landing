import { supabase } from '../lib/supabase';

export type ChecklistAutomacaoConfiguracao = {
  ativa: boolean;
  modo: 'TESTE' | 'REAL';
  fuso_horario: string;
  dia_util_ordem: number;
  horario_local: string;
  tentativas_max: number;
  intervalos_tentativas_minutos: number[];
  email_teste_destinatario: string;
  email_teste_cc: string;
  email_resumo_destinatario: string;
  email_resumo_cc: string;
  notificar_alteracoes: boolean;
  atualizado_em: string;
};

export type ChecklistAutomacaoCliente = {
  cliente_id: string;
  nome: string;
  cnpj: string;
  responsavel: string;
  status: string;
  arquivado: boolean;
  habilitada: boolean;
  competencia_inicial: string;
  motivo_pausa: string;
  atualizado_em: string;
};

export type ChecklistAutomacaoFeriado = {
  id: string;
  data: string;
  nome: string;
  abrangencia: 'NACIONAL' | 'ESTADUAL' | 'MUNICIPAL';
  uf: string;
  municipio: string;
  ativo: boolean;
  fonte: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistAutomacaoPainel = {
  usuario: Record<string, unknown>;
  configuracao: ChecklistAutomacaoConfiguracao;
  regras_fixas: {
    fuso_horario: string;
    dia_util_ordem: number;
    horario_local: string;
    intervalos_tentativas_minutos: number[];
    maximo_clientes_teste_manual: number;
  };
  resumo: {
    clientes_total: number;
    clientes_habilitados: number;
    execucoes_total: number;
    trabalhos_pendentes: number;
  };
  clientes: ChecklistAutomacaoCliente[];
  feriados: ChecklistAutomacaoFeriado[];
  ultimas_execucoes: Record<string, unknown>[];
  auditoria_recente: Record<string, unknown>[];
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export async function obterChecklistAutomacaoPainel(): Promise<ChecklistAutomacaoPainel> {
  const { data, error } = await supabase.rpc('obter_checklist_automacao_painel_portal');
  if (error) throw new Error(`Não foi possível carregar os controles da automação: ${message(error, 'erro desconhecido')}`);
  return data as ChecklistAutomacaoPainel;
}

export async function atualizarChecklistAutomacaoConfiguracao(
  configuracao: Record<string, unknown>,
  confirmacoes: string[] = [],
) {
  const { data, error } = await supabase.rpc('atualizar_checklist_automacao_configuracao_portal', {
    p_configuracao: configuracao,
    p_confirmacoes: confirmacoes,
  });
  if (error) throw new Error(`Não foi possível salvar a configuração: ${message(error, 'erro desconhecido')}`);
  return data;
}

export async function atualizarChecklistAutomacaoCliente(values: {
  clienteId: string;
  habilitada: boolean;
  competenciaInicial?: string | null;
  motivoPausa?: string | null;
}) {
  const { data, error } = await supabase.rpc('atualizar_checklist_automacao_cliente_portal', {
    p_cliente_id: values.clienteId,
    p_habilitada: values.habilitada,
    p_competencia_inicial: values.competenciaInicial || null,
    p_motivo_pausa: values.motivoPausa || null,
  });
  if (error) throw new Error(`Não foi possível alterar o cliente: ${message(error, 'erro desconhecido')}`);
  return data;
}

export async function atualizarChecklistAutomacaoClientesLote(values: {
  clienteIds: string[];
  habilitada: boolean;
  competenciaInicial?: string | null;
  motivoPausa?: string | null;
}) {
  const { data, error } = await supabase.rpc('atualizar_checklist_automacao_clientes_lote_portal', {
    p_cliente_ids: values.clienteIds,
    p_habilitada: values.habilitada,
    p_competencia_inicial: values.competenciaInicial || null,
    p_motivo_pausa: values.motivoPausa || null,
  });
  if (error) throw new Error(`Não foi possível alterar os clientes selecionados: ${message(error, 'erro desconhecido')}`);
  return data;
}

export async function salvarChecklistAutomacaoFeriado(feriado: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_automacao_feriado_portal', {
    p_feriado: feriado,
  });
  if (error) throw new Error(`Não foi possível salvar o feriado: ${message(error, 'erro desconhecido')}`);
  return data;
}

export async function excluirChecklistAutomacaoFeriado(feriadoId: string) {
  const { data, error } = await supabase.rpc('excluir_checklist_automacao_feriado_portal', {
    p_feriado_id: feriadoId,
    p_confirmacao: 'EXCLUIR FERIADO',
  });
  if (error) throw new Error(`Não foi possível excluir o feriado: ${message(error, 'erro desconhecido')}`);
  return data;
}

export async function simularChecklistAutomacao(competenciaReferencia: string) {
  const { data, error } = await supabase.rpc('simular_checklist_automacao_portal', {
    p_competencia_referencia: competenciaReferencia,
  });
  if (error) throw new Error(`Não foi possível simular a automação: ${message(error, 'erro desconhecido')}`);
  return data as Record<string, unknown>;
}

export async function simularChecklistAutomacaoTeste(
  competenciaReferencia: string,
  clienteIds: string[],
) {
  const { data, error } = await supabase.rpc('simular_checklist_automacao_teste_portal', {
    p_competencia_referencia: competenciaReferencia,
    p_cliente_ids: clienteIds,
  });
  if (error) throw new Error(`Não foi possível preparar a prévia do teste: ${message(error, 'erro desconhecido')}`);
  return data as Record<string, unknown>;
}

export async function executarChecklistAutomacaoTeste(values: {
  competenciaReferencia: string;
  clienteIds: string[];
  chaveRequisicao: string;
}) {
  const { data, error } = await supabase.functions.invoke('executar-checklist-automacao-teste', {
    body: {
      competencia_referencia: values.competenciaReferencia,
      cliente_ids: values.clienteIds,
      chave_requisicao: values.chaveRequisicao,
    },
  });
  if (error) throw new Error(`Não foi possível executar o teste: ${message(error, 'erro desconhecido')}`);
  if (data?.error) {
    const details = data?.details ? ` ${String(data.details)}` : '';
    throw new Error(`${String(data.error)}${details}`.trim());
  }
  return data as Record<string, unknown>;
}
