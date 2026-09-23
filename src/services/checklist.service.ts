import { supabase } from '../lib/supabase';

export const CHECKLIST_STATUS = {
  PENDENTE: 'PENDENTE',
  OK: 'OK',
  NA: 'NA',
  ERP: 'ERP',
} as const;

export type ChecklistStatus = typeof CHECKLIST_STATUS[keyof typeof CHECKLIST_STATUS];

export type ChecklistItem = {
  id: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistClienteItem = {
  id: string;
  cliente_id: string;
  item_id: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  item?: ChecklistItem | null;
};

export type ChecklistClienteItemPersonalizado = {
  id: string;
  cliente_id: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistStatusRow = {
  id: string;
  cliente_id: string;
  item_id: string;
  ano: number;
  mes: number;
  status: ChecklistStatus;
  atualizado_por: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistStatusPersonalizadoRow = {
  id: string;
  cliente_id: string;
  item_personalizado_id: string;
  ano: number;
  mes: number;
  status: ChecklistStatus;
  atualizado_por: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistContato = {
  id: string;
  cliente_id: string;
  email: string;
  cc: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistEnvio = {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_cnpj: string;
  competencias: unknown[];
  itens_cobrados: unknown[];
  destinatario: string;
  cc: string;
  assunto: string;
  qtd_pendencias: number;
  origem: string;
  status: string;
  tentativa: number;
  chave_idempotencia: string;
  execucao_id: string;
  email_resend_id: string;
  erro_codigo: string;
  erro_mensagem: string;
  enviado_por: string;
  enviado_por_nome: string;
  enviado_por_email: string;
  iniciado_em: string;
  finalizado_em: string;
  enviado_em: string;
  criado_em: string;
  atualizado_em: string;
};

export type ChecklistPendencia = {
  cliente_id: string;
  cnpj: string;
  razao_social: string;
  nome_identificacao: string;
  responsavel: string;
  revisor: string;
  ano: number;
  mes: number;
  competencia_inicio: string;
  item_id: string;
  item_descricao: string;
  item_ordem_cliente: number;
  status: ChecklistStatus;
  status_atualizado_em: string;
  status_atualizado_por_nome: string;
  email: string;
  cc: string;
  item_tipo: string;
  item_personalizado_id: string;
};

export type ChecklistResumo = {
  cliente_id: string;
  cnpj: string;
  razao_social: string;
  nome_identificacao: string;
  responsavel: string;
  revisor: string;
  ano: number;
  mes: number;
  total_itens: number;
  qtd_ok: number;
  qtd_nao_aplicavel: number;
  qtd_erp: number;
  qtd_pendentes: number;
  percentual_concluido: number;
};

export type ListarChecklistEnviosFiltros = {
  clienteId?: string;
  ano?: number;
  mes?: number;
  limite?: number;
};

export type ListarChecklistHistoricoFiltros = {
  pagina?: number;
  porPagina?: number;
  busca?: string;
  origem?: string;
  status?: string;
  responsavelId?: string;
  ano?: number;
  mes?: number;
  dataInicio?: string;
  dataFim?: string;
};

export type ChecklistHistoricoResumo = {
  total: number;
  enviados: number;
  falhas: number;
  processando: number;
  cancelados: number;
  manuais: number;
  automaticos: number;
};

export type ChecklistHistoricoResultado = {
  rows: ChecklistEnvio[];
  total: number;
  pagina: number;
  por_pagina: number;
  resumo: ChecklistHistoricoResumo;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value: unknown): ChecklistStatus {
  const status = text(value).toUpperCase();
  if (status === CHECKLIST_STATUS.OK) return CHECKLIST_STATUS.OK;
  if (status === CHECKLIST_STATUS.NA) return CHECKLIST_STATUS.NA;
  if (status === CHECKLIST_STATUS.ERP) return CHECKLIST_STATUS.ERP;
  return CHECKLIST_STATUS.PENDENTE;
}

function normalizeItem(row: Record<string, unknown>): ChecklistItem {
  return {
    id: text(row.id),
    descricao: text(row.descricao),
    ordem: numberValue(row.ordem),
    ativo: row.ativo !== false,
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizeClienteItem(row: Record<string, unknown>): ChecklistClienteItem {
  const nestedItem = row.checklist_itens && typeof row.checklist_itens === 'object'
    ? normalizeItem(row.checklist_itens as Record<string, unknown>)
    : null;

  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    item_id: text(row.item_id),
    ordem: numberValue(row.ordem),
    ativo: row.ativo !== false,
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
    item: nestedItem,
  };
}

function normalizeClienteItemPersonalizado(row: Record<string, unknown>): ChecklistClienteItemPersonalizado {
  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    descricao: text(row.descricao),
    ordem: numberValue(row.ordem),
    ativo: row.ativo !== false,
    criado_por: text(row.criado_por),
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizeStatusRow(row: Record<string, unknown>): ChecklistStatusRow {
  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    item_id: text(row.item_id),
    ano: numberValue(row.ano),
    mes: numberValue(row.mes),
    status: normalizeStatus(row.status),
    atualizado_por: text(row.atualizado_por),
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizeStatusPersonalizadoRow(row: Record<string, unknown>): ChecklistStatusPersonalizadoRow {
  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    item_personalizado_id: text(row.item_personalizado_id),
    ano: numberValue(row.ano),
    mes: numberValue(row.mes),
    status: normalizeStatus(row.status),
    atualizado_por: text(row.atualizado_por),
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizeContato(row: Record<string, unknown>): ChecklistContato {
  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    email: text(row.email),
    cc: text(row.cc),
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizeEnvio(row: Record<string, unknown>): ChecklistEnvio {
  return {
    id: text(row.id),
    cliente_id: text(row.cliente_id),
    cliente_nome: text(row.cliente_nome),
    cliente_cnpj: text(row.cliente_cnpj),
    competencias: arrayValue(row.competencias),
    itens_cobrados: arrayValue(row.itens_cobrados),
    destinatario: text(row.destinatario),
    cc: text(row.cc),
    assunto: text(row.assunto),
    qtd_pendencias: numberValue(row.qtd_pendencias),
    origem: text(row.origem),
    status: text(row.status),
    tentativa: numberValue(row.tentativa, 1),
    chave_idempotencia: text(row.chave_idempotencia),
    execucao_id: text(row.execucao_id),
    email_resend_id: text(row.email_resend_id),
    erro_codigo: text(row.erro_codigo),
    erro_mensagem: text(row.erro_mensagem),
    enviado_por: text(row.enviado_por),
    enviado_por_nome: text(row.enviado_por_nome),
    enviado_por_email: text(row.enviado_por_email),
    iniciado_em: text(row.iniciado_em),
    finalizado_em: text(row.finalizado_em),
    enviado_em: text(row.enviado_em),
    criado_em: text(row.criado_em),
    atualizado_em: text(row.atualizado_em),
  };
}

function normalizePendencia(row: Record<string, unknown>): ChecklistPendencia {
  return {
    cliente_id: text(row.cliente_id),
    cnpj: text(row.cnpj),
    razao_social: text(row.razao_social),
    nome_identificacao: text(row.nome_identificacao),
    responsavel: text(row.responsavel),
    revisor: text(row.revisor),
    ano: numberValue(row.ano),
    mes: numberValue(row.mes),
    competencia_inicio: text(row.competencia_inicio),
    item_id: text(row.item_id),
    item_descricao: text(row.item_descricao),
    item_ordem_cliente: numberValue(row.item_ordem_cliente),
    status: normalizeStatus(row.status),
    status_atualizado_em: text(row.status_atualizado_em),
    status_atualizado_por_nome: text(row.status_atualizado_por_nome),
    email: text(row.email),
    cc: text(row.cc),
    item_tipo: text(row.item_tipo),
    item_personalizado_id: text(row.item_personalizado_id),
  };
}

function normalizeResumo(row: Record<string, unknown>): ChecklistResumo {
  return {
    cliente_id: text(row.cliente_id),
    cnpj: text(row.cnpj),
    razao_social: text(row.razao_social),
    nome_identificacao: text(row.nome_identificacao),
    responsavel: text(row.responsavel),
    revisor: text(row.revisor),
    ano: numberValue(row.ano),
    mes: numberValue(row.mes),
    total_itens: numberValue(row.total_itens),
    qtd_ok: numberValue(row.qtd_ok),
    qtd_nao_aplicavel: numberValue(row.qtd_nao_aplicavel),
    qtd_erp: numberValue(row.qtd_erp),
    qtd_pendentes: numberValue(row.qtd_pendentes),
    percentual_concluido: numberValue(row.percentual_concluido),
  };
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export async function listarChecklistItens({ incluirInativos = false } = {}) {
  let query = supabase
    .from('checklist_itens')
    .select('*')
    .order('ordem', { ascending: true })
    .order('descricao', { ascending: true });

  if (!incluirInativos) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar itens do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeItem(row as Record<string, unknown>));
}

export async function salvarChecklistItem(item: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_item_portal', {
    p_item: item,
  });

  if (error) {
    throw new Error(`Não foi possível salvar item do checklist: ${error.message}`);
  }

  return normalizeItem(firstRow(data) as Record<string, unknown>);
}

export async function excluirChecklistItem(itemId: string) {
  const { data, error } = await supabase.rpc('excluir_checklist_item_portal', {
    p_item_id: itemId,
  });

  if (error) {
    throw new Error(`Não foi possível desativar item do checklist: ${error.message}`);
  }

  return normalizeItem(firstRow(data) as Record<string, unknown>);
}

export async function listarChecklistClienteItens(clienteId: string, { incluirInativos = false } = {}) {
  let query = supabase
    .from('checklist_clientes_itens')
    .select('*, checklist_itens(*)')
    .eq('cliente_id', clienteId)
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: true });

  if (!incluirInativos) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar itens do cliente no checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeClienteItem(row as Record<string, unknown>));
}

export async function salvarChecklistClienteItens(clienteId: string, itens: unknown[]) {
  const { data, error } = await supabase.rpc('salvar_checklist_cliente_itens_portal', {
    p_cliente_id: clienteId,
    p_itens: itens,
  });

  if (error) {
    throw new Error(`Não foi possível salvar itens do cliente no checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeClienteItem(row as Record<string, unknown>));
}

export async function listarChecklistClienteItensPersonalizados(clienteId: string, { incluirInativos = false } = {}) {
  let query = supabase
    .from('checklist_clientes_itens_personalizados')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('ordem', { ascending: true })
    .order('criado_em', { ascending: true });

  if (!incluirInativos) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar itens personalizados do cliente: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeClienteItemPersonalizado(row as Record<string, unknown>));
}

export async function salvarChecklistClienteItemPersonalizado(item: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_cliente_item_personalizado_portal', {
    p_item: item,
  });

  if (error) {
    throw new Error(`Não foi possível salvar item personalizado do checklist: ${error.message}`);
  }

  return normalizeClienteItemPersonalizado(firstRow(data) as Record<string, unknown>);
}

export async function excluirChecklistClienteItemPersonalizado(itemId: string) {
  const { data, error } = await supabase.rpc('excluir_checklist_cliente_item_personalizado_portal', {
    p_item_id: itemId,
  });

  if (error) {
    throw new Error(`Não foi possível remover item personalizado do checklist: ${error.message}`);
  }

  return normalizeClienteItemPersonalizado(firstRow(data) as Record<string, unknown>);
}

export async function listarChecklistStatus({ clienteId, ano, mes }: { clienteId?: string; ano?: number; mes?: number } = {}) {
  let query = supabase
    .from('checklist_status')
    .select('*')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });

  if (clienteId) query = query.eq('cliente_id', clienteId);
  if (ano) query = query.eq('ano', ano);
  if (mes) query = query.eq('mes', mes);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar status do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeStatusRow(row as Record<string, unknown>));
}

export async function salvarChecklistStatus(status: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_status_portal', {
    p_status: status,
  });

  if (error) {
    throw new Error(`Não foi possível salvar status do checklist: ${error.message}`);
  }

  return normalizeStatusRow(firstRow(data) as Record<string, unknown>);
}

export async function listarChecklistStatusPersonalizados({ clienteId, ano, mes }: { clienteId?: string; ano?: number; mes?: number } = {}) {
  let query = supabase
    .from('checklist_status_personalizados')
    .select('*')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false });

  if (clienteId) query = query.eq('cliente_id', clienteId);
  if (ano) query = query.eq('ano', ano);
  if (mes) query = query.eq('mes', mes);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar status dos itens personalizados do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeStatusPersonalizadoRow(row as Record<string, unknown>));
}

export async function salvarChecklistStatusPersonalizado(status: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_status_personalizado_portal', {
    p_status: status,
  });

  if (error) {
    throw new Error(`Não foi possível salvar status do item personalizado do checklist: ${error.message}`);
  }

  return normalizeStatusPersonalizadoRow(firstRow(data) as Record<string, unknown>);
}

export async function salvarChecklistStatusLote(statuses: unknown[]) {
  const { data, error } = await supabase.rpc('salvar_checklist_status_lote_portal', {
    p_statuses: statuses,
  });

  if (error) {
    throw new Error(`Não foi possível salvar status em lote do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeStatusRow(row as Record<string, unknown>));
}

export async function listarChecklistContatos() {
  const { data, error } = await supabase
    .from('checklist_contatos')
    .select('*')
    .order('atualizado_em', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar contatos do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeContato(row as Record<string, unknown>));
}

export async function salvarChecklistContato(contato: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_checklist_contato_portal', {
    p_contato: contato,
  });

  if (error) {
    throw new Error(`Não foi possível salvar contato do checklist: ${error.message}`);
  }

  return normalizeContato(firstRow(data) as Record<string, unknown>);
}

export async function listarChecklistPendencias({ ano, mes, clienteId }: { ano?: number; mes?: number; clienteId?: string } = {}) {
  let query = supabase
    .from('vw_checklist_pendencias')
    .select('*')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .order('item_ordem_cliente', { ascending: true });

  if (ano) query = query.eq('ano', ano);
  if (mes) query = query.eq('mes', mes);
  if (clienteId) query = query.eq('cliente_id', clienteId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar pendências do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizePendencia(row as Record<string, unknown>));
}

export async function listarChecklistResumo({ ano, mes, clienteId }: { ano?: number; mes?: number; clienteId?: string } = {}) {
  let query = supabase
    .from('vw_checklist_resumo')
    .select('*')
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .order('nome_identificacao', { ascending: true });

  if (ano) query = query.eq('ano', ano);
  if (mes) query = query.eq('mes', mes);
  if (clienteId) query = query.eq('cliente_id', clienteId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar resumo do checklist: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeResumo(row as Record<string, unknown>));
}

export async function listarChecklistEnvios(filtros: ListarChecklistEnviosFiltros = {}) {
  const limite = filtros.limite && filtros.limite > 0 ? filtros.limite : 500;
  let query = supabase
    .from('checklist_envios')
    .select('*')
    .order('enviado_em', { ascending: false })
    .limit(limite);

  if (filtros.clienteId) query = query.eq('cliente_id', filtros.clienteId);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar envios do checklist: ${error.message}`);
  }

  let rows = (data ?? []).map((row) => normalizeEnvio(row as Record<string, unknown>));

  if (filtros.ano || filtros.mes) {
    rows = rows.filter((envio) => envio.competencias.some((competencia) => {
      if (!competencia || typeof competencia !== 'object') return false;
      const item = competencia as Record<string, unknown>;
      const anoOk = filtros.ano ? numberValue(item.ano) === filtros.ano : true;
      const mesOk = filtros.mes ? numberValue(item.mes) === filtros.mes : true;
      return anoOk && mesOk;
    }));
  }

  return rows;
}

export async function listarChecklistHistorico(
  filtros: ListarChecklistHistoricoFiltros = {},
): Promise<ChecklistHistoricoResultado> {
  const payload = {
    pagina: filtros.pagina ?? 1,
    por_pagina: filtros.porPagina ?? 25,
    busca: filtros.busca || undefined,
    origem: filtros.origem || undefined,
    status: filtros.status || undefined,
    responsavel_id: filtros.responsavelId || undefined,
    ano: filtros.ano || undefined,
    mes: filtros.mes || undefined,
    data_inicio: filtros.dataInicio || undefined,
    data_fim: filtros.dataFim || undefined,
  };
  const { data, error } = await supabase.rpc('listar_checklist_envios_portal', {
    p_filtros: payload,
  });

  if (error) {
    throw new Error(`Não foi possível carregar o histórico de envios: ${error.message}`);
  }

  const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawSummary = (result.resumo && typeof result.resumo === 'object'
    ? result.resumo
    : {}) as Record<string, unknown>;

  return {
    rows: arrayValue(result.rows).map((row) => normalizeEnvio(row as Record<string, unknown>)),
    total: numberValue(result.total),
    pagina: numberValue(result.pagina, payload.pagina),
    por_pagina: numberValue(result.por_pagina, payload.por_pagina),
    resumo: {
      total: numberValue(rawSummary.total),
      enviados: numberValue(rawSummary.enviados),
      falhas: numberValue(rawSummary.falhas),
      processando: numberValue(rawSummary.processando),
      cancelados: numberValue(rawSummary.cancelados),
      manuais: numberValue(rawSummary.manuais),
      automaticos: numberValue(rawSummary.automaticos),
    },
  };
}

export async function registrarChecklistEnvio(envio: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('registrar_checklist_envio_portal', {
    p_envio: envio,
  });

  if (error) {
    throw new Error(`Não foi possível registrar envio do checklist: ${error.message}`);
  }

  return normalizeEnvio(firstRow(data) as Record<string, unknown>);
}

export async function enviarChecklistLembretes(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('enviar-lembrete-contabil', {
    body: payload,
  });

  if (error) {
    let remoteMessage = '';
    const context = 'context' in error ? error.context : null;
    if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
      try {
        const errorBody = await context.clone().json();
        if (errorBody && typeof errorBody === 'object') {
          const body = errorBody as Record<string, unknown>;
          remoteMessage = text(body.error);
          const details = text(body.details);
          if (details && details !== remoteMessage) remoteMessage = `${remoteMessage || 'Falha no envio.'} ${details}`;
        }
      } catch (_error) {
        // Mantem a mensagem fornecida pelo cliente do Supabase quando o corpo nao e JSON.
      }
    }
    throw new Error(remoteMessage || `Não foi possível enviar lembretes do checklist: ${error.message}`);
  }

  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as Record<string, unknown>).error || 'Não foi possível enviar lembretes do checklist.'));
  }

  return data;
}



