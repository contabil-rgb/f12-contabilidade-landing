export type ContratoSocialCliente = {
  id: string;
  cliente_id: string;
  versao: number;
  nome_arquivo: string;
  caminho_arquivo: string;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  observacao?: string | null;
  enviado_por?: string | null;
  criado_em?: string | null;
};
