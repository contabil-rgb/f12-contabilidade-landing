import { supabase } from '../lib/supabase';

function normalizeJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    cliente_id: row.cliente_id,
    cnpj: String(row.cnpj ?? '').trim(),
    razao_social: String(row.razao_social ?? '').trim(),
    nome_identificacao: String(row.nome_identificacao ?? '').trim(),
    responsavel: String(row.responsavel ?? '').trim(),
    revisor: String(row.revisor ?? '').trim(),
    modelo_tabela: String(row.modelo_tabela ?? '').trim(),
    modelo_tabela_label: String(row.modelo_tabela_label ?? '').trim(),
    periodicidade: String(row.periodicidade ?? '').trim(),
    ano_referencia: String(row.ano_referencia ?? '').trim(),
    meses: normalizeJsonArray(row.meses),
    assunto: String(row.assunto ?? '').trim(),
    corpo_mensagem: String(row.corpo_mensagem ?? '').trim(),
    socios: normalizeJsonArray(row.socios),
    criado_por: row.criado_por,
    criado_por_nome: String(row.criado_por_nome ?? '').trim(),
    criado_por_email: String(row.criado_por_email ?? '').trim(),
    criado_em: row.criado_em,
  };
}

export async function listarReinfRelatorios() {
  const { data, error } = await supabase
    .from('reinf_relatorios')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(`Não foi possível carregar relatórios REINF: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>));
}

export async function salvarReinfRelatorio(relatorio: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('salvar_reinf_relatorio_portal', {
    p_relatorio: relatorio,
  });

  if (error) {
    throw new Error(`Não foi possível salvar relatório REINF: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeRow(row as Record<string, unknown>);
}

export async function enviarReinfEmail(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('enviar-reinf-email', {
    body: payload,
  });

  if (error) {
    throw new Error(`Não foi possível enviar e-mail REINF: ${error.message}`);
  }

  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as Record<string, unknown>).error || 'Não foi possível enviar e-mail REINF.'));
  }

  return data;
}

export async function excluirReinfRelatorio(relatorioId: string) {
  const { data, error } = await supabase.rpc('excluir_reinf_relatorio_portal', {
    p_relatorio_id: relatorioId,
  });

  if (error) {
    throw new Error(`Não foi possível excluir relatório REINF: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeRow(row as Record<string, unknown>);
}
