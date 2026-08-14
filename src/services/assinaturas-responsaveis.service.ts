import { supabase } from '../lib/supabase';
import { normalizarNomeArquivo, timestampParaCaminho } from '../utils/normalizar-nome-arquivo';
import { normalizeListagemRow } from './listagens.service';

const BUCKET_ASSINATURAS_EMAIL = 'assinaturas-email';
const MAX_ASSINATURA_BYTES = 5 * 1024 * 1024;
const MIME_TYPES_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp']);
function normalizarTexto(value: unknown) {
  return String(value ?? '').trim();
}

function validarArquivoAssinatura(file: File) {
  if (!file) {
    throw new Error('Selecione uma imagem de assinatura.');
  }

  if (!MIME_TYPES_PERMITIDOS.has(file.type)) {
    throw new Error('A assinatura deve ser uma imagem PNG, JPEG ou WEBP.');
  }

  if (file.size > MAX_ASSINATURA_BYTES) {
    throw new Error('A assinatura deve ter no máximo 5 MB.');
  }
}

function buildAssinaturaPath(responsavelId: string, file: File) {
  const nomeNormalizado = normalizarNomeArquivo(file.name);
  const timestamp = timestampParaCaminho(new Date());
  return `responsaveis/${responsavelId}/${timestamp}-${nomeNormalizado}`;
}

async function removerArquivoAssinatura(path?: string | null) {
  const caminho = normalizarTexto(path);
  if (!caminho) return;

  const { error } = await supabase.storage
    .from(BUCKET_ASSINATURAS_EMAIL)
    .remove([caminho]);

  if (error) {
    throw new Error(`Erro ao remover assinatura do Storage: ${error.message}`);
  }
}

export function gerarUrlPublicaAssinaturaResponsavel(path?: string | null) {
  const caminho = normalizarTexto(path);
  if (!caminho) return '';

  const { data } = supabase.storage
    .from(BUCKET_ASSINATURAS_EMAIL)
    .getPublicUrl(caminho);

  return data?.publicUrl ?? '';
}

export async function salvarAssinaturaResponsavel(responsavel: Record<string, unknown>, file: File) {
  const responsavelId = normalizarTexto(responsavel?.id);
  if (!responsavelId) {
    throw new Error('Responsável inválido para salvar assinatura.');
  }

  validarArquivoAssinatura(file);

  const caminhoAnterior = normalizarTexto(responsavel?.assinatura_email_path);
  const novoPath = buildAssinaturaPath(responsavelId, file);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_ASSINATURAS_EMAIL)
    .upload(novoPath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Erro ao enviar assinatura para o Storage: ${uploadError.message}`);
  }

  try {
    const { data, error } = await supabase.rpc('salvar_assinatura_email_responsavel_portal', {
      p_responsavel_id: responsavelId,
      p_assinatura_email_path: novoPath,
      p_assinatura_email_nome_arquivo: file.name,
    });

    if (error) {
      throw new Error(`Não foi possível salvar assinatura no Supabase: ${error.message}`);
    }

    if (caminhoAnterior && caminhoAnterior !== novoPath) {
      try {
        await removerArquivoAssinatura(caminhoAnterior);
      } catch (cleanupError) {
        console.warn('[assinaturas-responsaveis] Falha ao remover assinatura antiga.', cleanupError);
      }
    }

    const row = Array.isArray(data) ? data[0] : data;
    return normalizeListagemRow(row as Record<string, unknown>);
  } catch (error) {
    try {
      await removerArquivoAssinatura(novoPath);
    } catch (cleanupError) {
      console.warn('[assinaturas-responsaveis] Falha ao limpar upload sem vinculo.', cleanupError);
    }
    throw error;
  }
}

export async function removerAssinaturaResponsavel(responsavel: Record<string, unknown>) {
  const responsavelId = normalizarTexto(responsavel?.id);
  if (!responsavelId) {
    throw new Error('Responsável inválido para remover assinatura.');
  }

  const caminhoAnterior = normalizarTexto(responsavel?.assinatura_email_path);

  const { data, error } = await supabase.rpc('remover_assinatura_email_responsavel_portal', {
    p_responsavel_id: responsavelId,
  });

  if (error) {
    throw new Error(`Não foi possível remover assinatura no Supabase: ${error.message}`);
  }

  if (caminhoAnterior) {
    try {
      await removerArquivoAssinatura(caminhoAnterior);
    } catch (cleanupError) {
      console.warn('[assinaturas-responsaveis] Falha ao remover arquivo de assinatura após limpar metadados.', cleanupError);
    }
  }

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeListagemRow(row as Record<string, unknown>);
}
