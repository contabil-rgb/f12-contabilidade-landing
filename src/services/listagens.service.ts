import { supabase } from '../lib/supabase';

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CATEGORY_ALIASES: Record<string, string> = {
  tipo_cliente: 'tipo_cliente',
  tipocliente: 'tipo_cliente',
  regime_tributario: 'regime_tributario',
  regimetributario: 'regime_tributario',
  atividades: 'atividades',
  atividade: 'atividades',
  responsavel: 'responsavel',
  revisor: 'revisor',
  competencia_em_dia: 'competencia_em_dia',
  competenciaemdia: 'competencia_em_dia',
  situacao: 'situacao',
  enviam_documentos: 'enviam_documentos',
  enviamdocumentos: 'enviam_documentos',
  modo_entrega: 'modo_entrega',
  modoentrega: 'modo_entrega',
  curva_envio: 'curva_envio',
  curvaenvio: 'curva_envio',
  revisado_coordenador: 'revisado_coordenador',
  revisadocoordenador: 'revisado_coordenador',
  lancamentos_padrao: 'lancamentos_padrao',
  lancamentospadrao: 'lancamentos_padrao',
  motivo_atraso: 'motivo_atraso',
  motivoatraso: 'motivo_atraso',
  cliente_notificado: 'cliente_notificado',
  clientenotificado: 'cliente_notificado',
  status_retorno_cliente: 'status_retorno_cliente',
  statusretornocliente: 'status_retorno_cliente',
  dificuldade: 'dificuldade',
  ecd: 'ecd',
  ecf: 'ecf',
  simnao: 'sim_nao',
};

function normalizeCategory(categoria: unknown) {
  const key = normalizeText(categoria).replace(/[\s-]/g, '_');
  return CATEGORY_ALIASES[key] ?? key;
}

function normalizeOptionValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = normalizeText(raw);
  if (normalized === 'sim') return 'Sim';
  if (normalized === 'nao') return 'Não';
  return raw;
}

function normalizeListagemRow(row: Record<string, unknown>) {
  return {
    ...row,
    categoria: normalizeCategory(row.categoria),
    valor: normalizeOptionValue(row.valor),
    ativo: row.ativo !== false,
  };
}

export async function listarTodasListagens({ incluirInativos = false } = {}) {
  let query = supabase
    .from('listagens')
    .select('id, categoria, valor, ordem, ativo')
    .order('ordem', { ascending: true })
    .order('valor', { ascending: true });

  if (!incluirInativos) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar listagens do Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeListagemRow(row));
}

export async function listarListagensAgrupadas() {
  const rows = await listarTodasListagens();
  const grouped = rows.reduce<Record<string, string[]>>((acc, item) => {
    const categoria = normalizeCategory(item.categoria);
    const valor = normalizeOptionValue(item.valor);
    if (!valor) return acc;
    if (!acc[categoria]) acc[categoria] = [];
    if (!acc[categoria].includes(valor)) {
      acc[categoria].push(valor);
    }
    return acc;
  }, {});
  return grouped;
}

export async function listarValoresListagemPorCategoria(categoria: unknown, { incluirInativos = false } = {}) {
  const categoriaNormalizada = normalizeCategory(categoria);
  const rows = await listarTodasListagens({ incluirInativos });
  return rows.filter((item) => normalizeCategory(item.categoria) === categoriaNormalizada);
}

export async function criarValorListagem(categoria: unknown, valor: unknown, { ordem = null, ativo = true } = {}) {
  const categoriaNormalizada = normalizeCategory(categoria);
  const valorNormalizado = normalizeOptionValue(valor);

  if (!valorNormalizado) {
    throw new Error('Informe um valor válido para a listagem.');
  }

  const payload: Record<string, unknown> = {
    categoria: categoriaNormalizada,
    valor: valorNormalizado,
    ativo,
  };
  if (ordem !== null && ordem !== undefined) {
    payload.ordem = ordem;
  }

  const { data, error } = await supabase
    .from('listagens')
    .insert(payload)
    .select('id, categoria, valor, ordem, ativo')
    .single();

  if (error) {
    throw new Error(`Não foi possível criar o valor da listagem: ${error.message}`);
  }

  return normalizeListagemRow(data);
}

export async function atualizarValorListagem(id: string, patch: Record<string, unknown> = {}) {
  if (!id) {
    throw new Error('Identificador da listagem não informado.');
  }

  const nextPatch = { ...patch };
  if ('categoria' in nextPatch) {
    nextPatch.categoria = normalizeCategory(nextPatch.categoria);
  }
  if ('valor' in nextPatch) {
    nextPatch.valor = normalizeOptionValue(nextPatch.valor);
  }

  const { data, error } = await supabase
    .from('listagens')
    .update(nextPatch)
    .eq('id', id)
    .select('id, categoria, valor, ordem, ativo')
    .single();

  if (error) {
    throw new Error(`Não foi possível atualizar o valor da listagem: ${error.message}`);
  }

  return normalizeListagemRow(data);
}

export function inativarValorListagem(id: string) {
  return atualizarValorListagem(id, { ativo: false });
}

export function reativarValorListagem(id: string) {
  return atualizarValorListagem(id, { ativo: true });
}
