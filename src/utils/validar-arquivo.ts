export const TIPOS_ARQUIVO_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const TAMANHO_MAXIMO_ANEXO_BYTES = 10 * 1024 * 1024;

export function validarArquivoAnexo(file: File) {
  if (!TIPOS_ARQUIVO_PERMITIDOS.includes(file.type as typeof TIPOS_ARQUIVO_PERMITIDOS[number])) {
    throw new Error('Formato nao permitido. Envie PDF, JPG, PNG ou WEBP.');
  }

  if (file.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
    throw new Error('Arquivo muito grande. O limite maximo e 10MB.');
  }
}
