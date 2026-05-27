export const TIPOS_ANEXO = {
  RECIBO_REINF: 'recibo_reinf',
  RECIBO_LUCROS: 'recibo_lucros',
  RECIBO_ECD: 'recibo_ecd',
  RECIBO_ECF: 'recibo_ecf',
  DOCUMENTACAO_MENSAL: 'documentacao_mensal',
  OUTROS: 'outros',
} as const;

export type TipoAnexo = typeof TIPOS_ANEXO[keyof typeof TIPOS_ANEXO];

export const TIPO_ANEXO_LABELS: Record<TipoAnexo, string> = {
  recibo_reinf: 'Recibo REINF',
  recibo_lucros: 'Recibo/Comprovante de Lucros',
  recibo_ecd: 'Recibo ECD',
  recibo_ecf: 'Recibo ECF',
  documentacao_mensal: 'Documentacao Mensal',
  outros: 'Outros',
};

export const TIPOS_ANEXO_OPTIONS = Object.entries(TIPO_ANEXO_LABELS).map(([value, label]) => ({
  value: value as TipoAnexo,
  label,
}));

export type AnexoCliente = {
  id: string;
  cliente_id: string;
  tipo_anexo: TipoAnexo;
  nome_arquivo: string;
  caminho_arquivo: string;
  url_arquivo?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  enviado_por?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};

export type ClienteAnexoRef = {
  id?: string;
  cnpj?: string;
  razao_social?: string;
  nome_identificacao?: string;
};
