import { supabase } from '../lib/supabase';
import { buscarClientePorCnpj } from './clientes.service';
import type { AnexoCliente, ClienteAnexoRef, TipoAnexo } from '../types/anexo';
import { normalizarNomeArquivo, timestampParaCaminho } from '../utils/normalizar-nome-arquivo';
import { validarArquivoAnexo } from '../utils/validar-arquivo';

const BUCKET_DOCUMENTOS_CLIENTES = 'documentos-clientes';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAnexoTimestamp(value?: string | null) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

function isUuid(value: unknown) {
  return UUID_REGEX.test(String(value ?? '').trim());
}

function buildStoragePath(clienteId: string, tipoAnexo: TipoAnexo, nomeArquivo: string) {
  const nomeNormalizado = normalizarNomeArquivo(nomeArquivo);
  const timestamp = timestampParaCaminho(new Date());
  return `clientes/${clienteId}/${tipoAnexo}/${timestamp}-${nomeNormalizado}`;
}

async function getUsuarioPortalIdPorSessao() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

function normalizeAnexoRow(row: Record<string, unknown>) {
  return {
    ...row,
    url_arquivo: null,
  } as AnexoCliente;
}

export function getAnexoDataReferencia(anexo?: AnexoCliente | null) {
  if (!anexo) return '';
  return anexo.atualizado_em || anexo.criado_em || '';
}

export function sortAnexosPorRecencia<T extends AnexoCliente>(anexos: T[]) {
  return [...(anexos ?? [])].sort((left, right) => {
    const leftTime = getAnexoTimestamp(getAnexoDataReferencia(left));
    const rightTime = getAnexoTimestamp(getAnexoDataReferencia(right));
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(left.nome_arquivo ?? '').localeCompare(String(right.nome_arquivo ?? ''), 'pt-BR');
  });
}

function resolveClienteId(cliente: ClienteAnexoRef) {
  const id = String(cliente.id ?? '').trim();
  return isUuid(id) ? id : '';
}

async function resolveClientePersistidoId(cliente: ClienteAnexoRef) {
  const directId = resolveClienteId(cliente);
  if (directId) return directId;

  const cnpjDigits = String(cliente.cnpj ?? '').replace(/\D/g, '');
  if (!cnpjDigits) return '';

  try {
    const persistedClient = await buscarClientePorCnpj(cnpjDigits);
    const persistedId = String(persistedClient?.id ?? '').trim();
    return isUuid(persistedId) ? persistedId : '';
  } catch {
    return '';
  }
}

async function uploadArquivoStorage(path: string, file: File) {
  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_CLIENTES)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
  if (error) {
    throw new Error(`Erro ao enviar arquivo para o Storage: ${error.message}`);
  }
}

function ensureClientePersistido(clienteId: string) {
  if (clienteId) return clienteId;
  throw new Error('Salve primeiro o cliente no Supabase para anexar arquivos.');
}

export async function listarAnexosCliente(cliente: ClienteAnexoRef) {
  const clienteId = await resolveClientePersistidoId(cliente);
  if (!clienteId) {
    return [];
  }

  const { data, error } = await supabase
    .from('anexos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('atualizado_em', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar anexos do cliente: ${error.message}`);
  }

  return sortAnexosPorRecencia((data ?? []).map((row) => normalizeAnexoRow(row as Record<string, unknown>)));
}

export async function listarUltimosAnexosPorClientes(clienteIds: string[]) {
  const ids = [...new Set((clienteIds ?? []).filter((id) => isUuid(id)))];
  if (!ids.length) return {} as Record<string, Partial<Record<TipoAnexo, AnexoCliente>>>;

  const { data, error } = await supabase
    .from('anexos')
    .select('*')
    .in('cliente_id', ids)
    .order('atualizado_em', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível consultar anexos por cliente: ${error.message}`);
  }

  const grouped: Record<string, Partial<Record<TipoAnexo, AnexoCliente>>> = {};
  const seen = new Set<string>();

  (data ?? []).forEach((row) => {
    const anexo = normalizeAnexoRow(row as Record<string, unknown>);
    const clienteId = String(anexo.cliente_id ?? '');
    const tipo = anexo.tipo_anexo;
    if (!clienteId || !tipo) return;
    const dedupeKey = `${clienteId}:${tipo}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    if (!grouped[clienteId]) grouped[clienteId] = {};
    grouped[clienteId][tipo] = anexo;
  });

  return grouped;
}

export async function buscarAnexoPorTipo(cliente: ClienteAnexoRef, tipoAnexo: TipoAnexo) {
  const clienteId = await resolveClientePersistidoId(cliente);
  if (!clienteId) {
    return null;
  }

  const { data, error } = await supabase
    .from('anexos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('tipo_anexo', tipoAnexo)
    .order('atualizado_em', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível buscar anexo por tipo: ${error.message}`);
  }

  return data ? normalizeAnexoRow(data as Record<string, unknown>) : null;
}

export async function uploadAnexoCliente(params: {
  cliente: ClienteAnexoRef;
  tipoAnexo: TipoAnexo;
  file: File;
}) {
  validarArquivoAnexo(params.file);
  const clienteId = ensureClientePersistido(await resolveClientePersistidoId(params.cliente));

  const path = buildStoragePath(clienteId, params.tipoAnexo, params.file.name);
  await uploadArquivoStorage(path, params.file);

  const enviadoPor = await getUsuarioPortalIdPorSessao();
  const payload = {
    cliente_id: clienteId,
    tipo_anexo: params.tipoAnexo,
    nome_arquivo: params.file.name,
    caminho_arquivo: path,
    mime_type: params.file.type,
    tamanho_bytes: params.file.size,
    enviado_por: enviadoPor,
  };

  const { data, error } = await supabase
    .from('anexos')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Não foi possível gravar vínculo do anexo: ${error.message}`);
  }

  return normalizeAnexoRow(data as Record<string, unknown>);
}

export async function substituirAnexoCliente(params: {
  cliente: ClienteAnexoRef;
  tipoAnexo: TipoAnexo;
  file: File;
  anexoExistente?: AnexoCliente | null;
}) {
  validarArquivoAnexo(params.file);
  const clienteId = ensureClientePersistido(await resolveClientePersistidoId(params.cliente));

  const anexoAtual = params.anexoExistente ?? await buscarAnexoPorTipo(params.cliente, params.tipoAnexo);
  const novoPath = buildStoragePath(clienteId, params.tipoAnexo, params.file.name);
  await uploadArquivoStorage(novoPath, params.file);

  const enviadoPor = await getUsuarioPortalIdPorSessao();
  if (!anexoAtual?.id) {
    return uploadAnexoCliente(params);
  }

  const { data, error } = await supabase
    .from('anexos')
    .update({
      nome_arquivo: params.file.name,
      caminho_arquivo: novoPath,
      mime_type: params.file.type,
      tamanho_bytes: params.file.size,
      enviado_por: enviadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', anexoAtual.id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Não foi possível substituir anexo: ${error.message}`);
  }

  return normalizeAnexoRow(data as Record<string, unknown>);
}

export async function gerarUrlAssinada(caminhoArquivo: string, expires = 600) {
  if (!caminhoArquivo) {
    throw new Error('Caminho do arquivo nao informado.');
  }
  if (/^(blob:|https?:\/\/)/i.test(caminhoArquivo)) {
    return caminhoArquivo;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_CLIENTES)
    .createSignedUrl(caminhoArquivo, expires);

  if (error || !data?.signedUrl) {
    throw new Error(`Não foi possível gerar URL assinada: ${error?.message ?? 'erro desconhecido'}`);
  }

  return data.signedUrl;
}

export async function gerarUrlVisualizacaoAnexo(anexo: AnexoCliente) {
  return gerarUrlAssinada(anexo.caminho_arquivo, 600);
}

export async function gerarUrlDownloadAnexo(anexo: AnexoCliente) {
  return gerarUrlAssinada(anexo.caminho_arquivo, 600);
}
