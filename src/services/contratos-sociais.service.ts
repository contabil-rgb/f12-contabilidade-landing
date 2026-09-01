import { supabase } from '../lib/supabase';
import type { ClienteAnexoRef } from '../types/anexo';
import type { ContratoSocialCliente } from '../types/contrato-social';
import { normalizarNomeArquivo, timestampParaCaminho } from '../utils/normalizar-nome-arquivo';
import { validarArquivoAnexo } from '../utils/validar-arquivo';

const BUCKET_DOCUMENTOS_CLIENTES = 'documentos-clientes';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown) {
  return UUID_REGEX.test(String(value ?? '').trim());
}

function normalizeCnpjDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatCnpjDigits(value: string) {
  const digits = normalizeCnpjDigits(value);
  if (digits.length !== 14) return digits;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function resolveClienteId(cliente: ClienteAnexoRef) {
  const id = String(cliente.id ?? '').trim();
  return isUuid(id) ? id : '';
}

function parseAttachmentStoragePath(value: unknown) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return String(
        parsed.path
        ?? parsed.caminho_arquivo
        ?? parsed.url
        ?? parsed.href
        ?? '',
      ).trim();
    }
  } catch {
    // Valores legados em texto simples ainda podem existir.
  }

  return raw;
}

function resolveClienteIdFromAttachmentFields(cliente: ClienteAnexoRef) {
  const source = cliente as ClienteAnexoRef & Record<string, unknown>;
  const attachmentFields = [
    'anexo_cartao_cnpj',
    'anexo_cartao_qsa',
    'anexo_recibo_reinf',
    'anexo_recibo_lucros',
    'anexo_recibo_ecd',
    'anexo_recibo_ecf',
    'anexo_documentacao_mensal',
    'anexo_outros',
  ];

  for (const fieldKey of attachmentFields) {
    const path = parseAttachmentStoragePath(source[fieldKey]);
    const match = path.match(/(?:^|\/)clientes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i);
    if (match?.[1] && isUuid(match[1])) {
      return match[1];
    }
  }

  return '';
}

async function resolveClientePersistidoId(cliente: ClienteAnexoRef) {
  const directId = resolveClienteId(cliente);
  if (directId) return directId;

  const attachmentClienteId = resolveClienteIdFromAttachmentFields(cliente);
  if (attachmentClienteId) return attachmentClienteId;

  const cnpjDigits = normalizeCnpjDigits(cliente.cnpj);
  if (!cnpjDigits) return '';

  const candidates = [...new Set([formatCnpjDigits(cnpjDigits), cnpjDigits].filter(Boolean))];

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, cnpj')
      .eq('cnpj', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`Não foi possível localizar o cliente pelo CNPJ: ${error.message}`);
    }

    const persistedId = String(data?.id ?? '').trim();
    if (isUuid(persistedId)) return persistedId;
  }

  const { data, error } = await supabase
    .from('clientes')
    .select('id, cnpj');

  if (error) {
    throw new Error(`Não foi possível consultar clientes para localizar o contrato social: ${error.message}`);
  }

  const persistedClient = (data ?? []).find((row) => normalizeCnpjDigits(row?.cnpj) === cnpjDigits);
  const persistedId = String(persistedClient?.id ?? '').trim();
  return isUuid(persistedId) ? persistedId : '';
}

function ensureClientePersistido(clienteId: string) {
  if (clienteId) return clienteId;
  throw new Error('Não foi possível localizar este cliente no Supabase. Atualize a base e tente anexar novamente.');
}

function buildContratoSocialStoragePath(clienteId: string, nomeArquivo: string) {
  const nomeNormalizado = normalizarNomeArquivo(nomeArquivo);
  const timestamp = timestampParaCaminho(new Date());
  return `clientes/${clienteId}/contrato_social/${timestamp}-${nomeNormalizado}`;
}

function normalizeContratoSocialRow(row: Record<string, unknown>) {
  return {
    ...row,
    versao: Number(row.versao ?? 0),
  } as ContratoSocialCliente;
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
    throw new Error(`Erro ao enviar contrato social para o Storage: ${error.message}`);
  }
}

async function removerArquivoStorage(path?: string | null) {
  const caminho = String(path ?? '').trim();
  if (!caminho) return;
  if (/^(blob:|https?:\/\/)/i.test(caminho)) return;

  const { error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS_CLIENTES)
    .remove([caminho]);

  if (error) {
    throw new Error(`Erro ao remover contrato social do Storage: ${error.message}`);
  }
}

export function sortContratosSociaisPorVersao<T extends ContratoSocialCliente>(contratos: T[]) {
  return [...(contratos ?? [])].sort((left, right) => {
    if (right.versao !== left.versao) return right.versao - left.versao;
    const rightTime = right.criado_em ? new Date(right.criado_em).getTime() : 0;
    const leftTime = left.criado_em ? new Date(left.criado_em).getTime() : 0;
    return rightTime - leftTime;
  });
}

export async function listarContratosSociaisCliente(cliente: ClienteAnexoRef) {
  const clienteId = await resolveClientePersistidoId(cliente);
  if (!clienteId) {
    return [] as ContratoSocialCliente[];
  }

  const { data, error } = await supabase.rpc('listar_contratos_sociais_cliente_portal', {
    p_cliente_id: clienteId,
  });

  if (error) {
    throw new Error(`Não foi possível carregar contratos sociais do cliente: ${error.message}`);
  }

  return sortContratosSociaisPorVersao(
    (data ?? []).map((row) => normalizeContratoSocialRow(row as Record<string, unknown>)),
  );
}

export async function listarUltimosContratosSociaisPorClientes(clienteIds: string[]) {
  const ids = [...new Set((clienteIds ?? []).filter((id) => isUuid(id)))];
  if (!ids.length) return {} as Record<string, ContratoSocialCliente>;

  const { data, error } = await supabase
    .from('clientes_contratos_sociais')
    .select('*')
    .in('cliente_id', ids)
    .order('versao', { ascending: false })
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(`Não foi possível consultar contratos sociais por cliente: ${error.message}`);
  }

  const grouped: Record<string, ContratoSocialCliente> = {};

  (data ?? []).forEach((row) => {
    const contrato = normalizeContratoSocialRow(row as Record<string, unknown>);
    const clienteId = String(contrato.cliente_id ?? '');
    if (!clienteId || grouped[clienteId]) return;
    grouped[clienteId] = contrato;
  });

  return grouped;
}

export async function uploadContratoSocialCliente(params: {
  cliente: ClienteAnexoRef;
  file: File;
  observacao?: string;
}) {
  validarArquivoAnexo(params.file);
  const clienteId = ensureClientePersistido(await resolveClientePersistidoId(params.cliente));
  const path = buildContratoSocialStoragePath(clienteId, params.file.name);

  await uploadArquivoStorage(path, params.file);

  try {
    const { data, error } = await supabase.rpc('registrar_contrato_social_cliente_portal', {
      p_cliente_id: clienteId,
      p_nome_arquivo: params.file.name,
      p_caminho_arquivo: path,
      p_mime_type: params.file.type,
      p_tamanho_bytes: params.file.size,
      p_observacao: params.observacao ?? null,
    });

    if (error) {
      throw new Error(`Não foi possível registrar contrato social: ${error.message}`);
    }

    return normalizeContratoSocialRow(data as Record<string, unknown>);
  } catch (error) {
    try {
      await removerArquivoStorage(path);
    } catch (cleanupError) {
      console.warn('[contratos-sociais] Falha ao limpar upload sem vínculo após erro no banco.', cleanupError);
    }
    throw error;
  }
}

export async function removerContratoSocialCliente(contrato: ContratoSocialCliente) {
  const contratoId = String(contrato?.id ?? '').trim();
  if (!isUuid(contratoId)) {
    throw new Error('Contrato social inválido para remoção.');
  }

  const { data, error } = await supabase.rpc('remover_contrato_social_cliente_portal', {
    p_contrato_id: contratoId,
  });

  if (error) {
    throw new Error(`Não foi possível remover contrato social: ${error.message}`);
  }

  const contratoRemovido = normalizeContratoSocialRow(data as Record<string, unknown>);

  try {
    await removerArquivoStorage(contratoRemovido.caminho_arquivo || contrato.caminho_arquivo);
  } catch (cleanupError) {
    console.warn('[contratos-sociais] Falha ao remover arquivo do Storage após limpar vínculo.', cleanupError);
  }

  return contratoRemovido;
}

export async function gerarUrlContratoSocial(caminhoArquivo: string, expires = 600) {
  if (!caminhoArquivo) {
    throw new Error('Caminho do contrato social não informado.');
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
