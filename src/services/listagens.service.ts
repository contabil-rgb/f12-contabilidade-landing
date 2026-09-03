import { supabase } from '../lib/supabase';

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const CATEGORY_ALIASES: Record<string, string> = {
  tipo_cliente: 'tipo_cliente',
  tipocliente: 'tipo_cliente',
  regime_tributario: 'regime_tributario',
  regimetributario: 'regime_tributario',
  atividades: 'atividades',
  atividade: 'atividades',
  responsavel: 'responsavel',
  responsavel_ecf: 'responsavel_ecf',
  responsavelecf: 'responsavel_ecf',
  responsavel_pela_ecf: 'responsavel_ecf',
  responsavelpelaecf: 'responsavel_ecf',
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

export function getListagemComparableKey(categoria: unknown, valor: unknown) {
  const categoriaNormalizada = normalizeCategory(categoria);
  const valorNormalizado = normalizeText(normalizeOptionValue(valor));
  return valorNormalizado ? `${categoriaNormalizada}:${valorNormalizado}` : '';
}

export function isSameListagemValue(
  leftCategoria: unknown,
  leftValor: unknown,
  rightCategoria: unknown,
  rightValor: unknown,
) {
  const leftKey = getListagemComparableKey(leftCategoria, leftValor);
  return Boolean(leftKey && leftKey === getListagemComparableKey(rightCategoria, rightValor));
}

export function findMatchingListagemValue(
  rows: Record<string, unknown>[] = [],
  categoria: unknown,
  valor: unknown,
  { ignoreId = '' } = {},
) {
  const targetKey = getListagemComparableKey(categoria, valor);
  if (!targetKey) return null;

  return rows.find((row) => {
    if (ignoreId && String(row.id ?? '') === String(ignoreId)) return false;
    return getListagemComparableKey(row.categoria, row.valor) === targetKey;
  }) ?? null;
}

function normalizeNullableText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

function normalizeNullableTimestamp(value: unknown) {
  return value ? String(value) : '';
}

export function normalizeListagemRow(row: Record<string, unknown>) {
  return {
    ...row,
    categoria: normalizeCategory(row.categoria),
    valor: normalizeOptionValue(row.valor),
    ativo: row.ativo !== false,
    assinatura_email_path: normalizeNullableText(row.assinatura_email_path),
    assinatura_email_nome_arquivo: normalizeNullableText(row.assinatura_email_nome_arquivo),
    assinatura_email_atualizada_em: normalizeNullableTimestamp(row.assinatura_email_atualizada_em),
  };
}

const LISTAGENS_SELECT = 'id, categoria, valor, ordem, ativo, assinatura_email_path, assinatura_email_nome_arquivo, assinatura_email_atualizada_em';

async function listarListagensPorCategoriaNormalizada(categoriaNormalizada: string) {
  const { data, error } = await supabase
    .from('listagens')
    .select(LISTAGENS_SELECT)
    .eq('categoria', categoriaNormalizada)
    .order('ordem', { ascending: true })
    .order('valor', { ascending: true });

  if (error) {
    throw new Error(`Não foi possível validar a listagem no Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeListagemRow(row));
}

async function findExistingListagemValue(categoriaNormalizada: string, valor: unknown, { ignoreId = '' } = {}) {
  const rows = await listarListagensPorCategoriaNormalizada(categoriaNormalizada);
  return findMatchingListagemValue(rows, categoriaNormalizada, valor, { ignoreId });
}

export const DUPLICATE_LISTAGEM_ERROR_NAME = 'DuplicateListagemError';

export function isDuplicateListagemError(error: unknown) {
  return error instanceof Error && error.name === DUPLICATE_LISTAGEM_ERROR_NAME;
}

function createDuplicateListagemError(match: Record<string, unknown>) {
  const valor = normalizeOptionValue(match?.valor);
  const status = match?.ativo === false ? 'inativa' : 'ativa';
  const error = new Error(`Já existe uma opção ${status} cadastrada com esse nome: ${valor}.`);
  error.name = DUPLICATE_LISTAGEM_ERROR_NAME;
  return error;
}

export async function listarTodasListagens({ incluirInativos = false } = {}) {
  let query = supabase
    .from('listagens')
    .select(LISTAGENS_SELECT)
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
    if (!acc[categoria].some((currentValue) => isSameListagemValue(categoria, currentValue, categoria, valor))) {
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

  const duplicate = await findExistingListagemValue(categoriaNormalizada, valorNormalizado);
  if (duplicate) {
    throw createDuplicateListagemError(duplicate);
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
    .select(LISTAGENS_SELECT)
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
  const changesCategory = 'categoria' in nextPatch;
  const changesValue = 'valor' in nextPatch;
  let currentRow = null;

  if (changesCategory || changesValue) {
    const { data: current, error: currentError } = await supabase
      .from('listagens')
      .select(LISTAGENS_SELECT)
      .eq('id', id)
      .single();

    if (currentError) {
      throw new Error(`Não foi possível validar o valor da listagem: ${currentError.message}`);
    }

    currentRow = normalizeListagemRow(current);
  }

  if ('categoria' in nextPatch) {
    nextPatch.categoria = normalizeCategory(nextPatch.categoria);
  }
  if ('valor' in nextPatch) {
    nextPatch.valor = normalizeOptionValue(nextPatch.valor);
  }

  if (currentRow && (changesCategory || changesValue)) {
    const nextCategoria = changesCategory ? nextPatch.categoria : currentRow.categoria;
    const nextValor = changesValue ? nextPatch.valor : currentRow.valor;
    const duplicate = await findExistingListagemValue(String(nextCategoria ?? ''), nextValor, { ignoreId: id });
    if (duplicate) {
      throw createDuplicateListagemError(duplicate);
    }
  }

  const { data, error } = await supabase
    .from('listagens')
    .update(nextPatch)
    .eq('id', id)
    .select(LISTAGENS_SELECT)
    .single();

  if (error) {
    throw new Error(`Não foi possível atualizar o valor da listagem: ${error.message}`);
  }

  return normalizeListagemRow(data);
}

export async function excluirValorListagem(id: string, categoria: unknown = 'responsavel') {
  if (!id) {
    throw new Error('Identificador da listagem não informado.');
  }

  const categoriaNormalizada = normalizeCategory(categoria);
  const { data, error } = await supabase
    .from('listagens')
    .delete()
    .eq('id', id)
    .eq('categoria', categoriaNormalizada)
    .select(LISTAGENS_SELECT)
    .single();

  if (error) {
    throw new Error(`Não foi possível excluir o valor da listagem: ${error.message}`);
  }

  return normalizeListagemRow(data);
}

export function inativarValorListagem(id: string) {
  return atualizarValorListagem(id, { ativo: false });
}

export function reativarValorListagem(id: string) {
  return atualizarValorListagem(id, { ativo: true });
}
