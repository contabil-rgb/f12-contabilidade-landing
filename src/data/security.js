export const AUTH_SESSION_KEY = 'portal-contabilidade-f12-session-v4';

export const RESET_TOKEN_MINUTES = 15;
export const LOGIN_LOCK_MINUTES = 15;

export const USER_STATUS = ['Ativo', 'Inativo'];

export const ACCESS_PROFILE_KEYS = {
  COORDINATOR_ADMIN: 'coordenador_administrador',
  ACCOUNTING_OPERATIONAL: 'setor_contabil_operacional',
};

export const PERMISSIONS = {
  USERS_MANAGE: 'users_manage',
  IMPORT_EXCEL: 'import_excel',
  CLIENTS_VIEW_ALL: 'clients_view_all',
  CLIENTS_VIEW_ASSIGNED: 'clients_view_assigned',
  CLIENTS_CREATE: 'clients_create',
  CLIENTS_EDIT_ALL: 'clients_edit_all',
  CLIENTS_EDIT_STATUS: 'clients_edit_status',
  CLIENTS_EDIT_OPERATIONAL: 'clients_edit_operational',
  CLIENTS_EDIT_SIMPLE: 'clients_edit_simple',
  CLIENTS_INACTIVATE: 'clients_inactivate',
  CHANGE_RESPONSIBLES: 'change_responsibles',
  DASHBOARDS_VIEW: 'dashboards_view',
  REPORTS_VIEW: 'reports_view',
  REPORTS_EXPORT: 'reports_export',
  HISTORY_VIEW: 'history_view',
  HISTORY_DELETE: 'history_delete',
};

export const ACCESS_PROFILES = {
  [ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN]: {
    label: 'Coordenador / Administrador',
    description: 'Acesso completo ao portal, clientes, importaÃ§Ã£o, relatÃ³rios, histÃ³rico e configuraÃ§Ãµes principais.',
    permissions: Object.values(PERMISSIONS),
  },
  [ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL]: {
    label: 'Setor Contabil / Operacional',
    description: 'Acesso operacional compartilhado para consultar a base e atualizar competências e obrigações.',
    permissions: [
      PERMISSIONS.CLIENTS_VIEW_ALL,
      PERMISSIONS.CLIENTS_CREATE,
      PERMISSIONS.CLIENTS_EDIT_STATUS,
      PERMISSIONS.CLIENTS_EDIT_OPERATIONAL,
      PERMISSIONS.CLIENTS_INACTIVATE,
      PERMISSIONS.DASHBOARDS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.REPORTS_EXPORT,
    ],
  },
};

export const ACCESS_PROFILE_OPTIONS = Object.entries(ACCESS_PROFILES).map(([value, profile]) => ({
  value,
  label: profile.label,
  description: profile.description,
}));

export const HISTORY_FIELDS = [
  'anexo_cartao_cnpj',
  'regime_tributario',
  'responsavel',
  'revisor',
  'competencia_em_dia',
  'ultima_competencia_entregue',
  'situacao',
  'dias_atraso',
  'distribuicao_lucros',
  'envio_reinf',
  'data_enviada_reinf',
  'anexo_recibo_reinf',
  'anexo_recibo_lucros',
  'ecd',
  'ultima_ecd_entregue',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'anexo_recibo_ecd',
  'ecf',
  'ultima_ecf_entregue',
  'data_entrega_ecf',
  'data_envio_ecf',
  'anexo_recibo_ecf',
  'precisa_ata',
  'ata_entregue',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
  'pendencias_observacoes',
];

export const SENSITIVE_CLIENT_FIELDS = [
  'regime_tributario',
  'responsavel',
  'revisor',
  'distribuicao_lucros',
  'precisa_ata',
];

export const STATUS_CLIENT_FIELDS = [
  'competencia_em_dia',
  'ultima_competencia_entregue',
  'situacao',
  'dias_atraso',
  'revisado_coordenador',
  'motivo_atraso',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
];

export const OPERATIONAL_CLIENT_FIELDS = [
  'cnpj',
  'anexo_cartao_cnpj',
  'razao_social',
  'nome_identificacao',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'dificuldade',
  'distribuicao_lucros',
  'lucro',
  'primeira_competencia',
  'tem_folha',
  'ultima_importacao',
  'ultima_competencia_entregue',
  'competencia_em_dia',
  'dias_atraso',
  'situacao',
  'enviam_documentos',
  'modo_entrega',
  'curva_envio',
  'ultima_competencia_enviada',
  'data_envio_documentos',
  'pendencias_observacoes',
  'lancamentos_padrao',
  'motivo_atraso',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
  'envio_reinf',
  'data_enviada_reinf',
  'anexo_recibo_reinf',
  'anexo_recibo_lucros',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'anexo_recibo_ecd',
  'anexo_recibo_ecf',
  'ultima_ecd_entregue',
  'ultima_ecf_entregue',
  'data_entrega_ecf',
  'data_envio_ecf',
  'ata_entregue',
  'data_entrega_ata',
];

export const SIMPLE_OPERATIONAL_CLIENT_FIELDS = [
  'enviam_documentos',
  'ultima_competencia_enviada',
  'data_envio_documentos',
  'pendencias_observacoes',
  'motivo_atraso',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
];

export const COMMON_PASSWORDS = [
  '123456',
  'senha123',
  'admin123',
  'f12contabilidade',
  'contabilidade123',
  'password',
];

