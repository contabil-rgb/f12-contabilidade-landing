export const AUTH_SESSION_KEY = 'portal-contabilidade-f12-session-v4';

export const SESSION_TIMEOUT_MINUTES = 30;
export const RESET_TOKEN_MINUTES = 15;
export const LOGIN_LOCK_MINUTES = 15;
export const MAX_INVALID_LOGIN_ATTEMPTS = 5;

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
  CLIENTS_EDIT_ALL: 'clients_edit_all',
  CLIENTS_EDIT_STATUS: 'clients_edit_status',
  CLIENTS_EDIT_OPERATIONAL: 'clients_edit_operational',
  CLIENTS_EDIT_SIMPLE: 'clients_edit_simple',
  CLIENTS_INACTIVATE: 'clients_inactivate',
  CHANGE_RESPONSIBLES: 'change_responsibles',
  DASHBOARDS_VIEW: 'dashboards_view',
  PENDENCIAS_VIEW: 'pendencias_view',
  REPORTS_VIEW: 'reports_view',
  REPORTS_EXPORT: 'reports_export',
  HISTORY_VIEW: 'history_view',
};

export const ACCESS_PROFILES = {
  [ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN]: {
    label: 'Coordenador / Administrador',
    description: 'Acesso completo ao portal, clientes, importação, relatórios, histórico e configurações principais.',
    permissions: Object.values(PERMISSIONS),
  },
  [ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL]: {
    label: 'Setor Contábil / Operacional',
    description: 'Acesso operacional compartilhado para consultar a base e atualizar competências, pendências e obrigações.',
    permissions: [
      PERMISSIONS.CLIENTS_VIEW_ALL,
      PERMISSIONS.CLIENTS_EDIT_STATUS,
      PERMISSIONS.CLIENTS_EDIT_OPERATIONAL,
      PERMISSIONS.DASHBOARDS_VIEW,
      PERMISSIONS.PENDENCIAS_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
};

export const ACCESS_PROFILE_OPTIONS = Object.entries(ACCESS_PROFILES).map(([value, profile]) => ({
  value,
  label: profile.label,
  description: profile.description,
}));

export const INITIAL_USERS = [
  {
    id: 'user-coordenador',
    nome: 'Coordenador',
    email: 'leticiacampos@f12contabilidade.com.br',
    senha_hash: '',
    cargo: 'Coordenador',
    setor: 'Contabilidade',
    perfil_acesso: ACCESS_PROFILE_KEYS.COORDINATOR_ADMIN,
    status: 'Ativo',
    ultimo_acesso: '',
    precisa_trocar_senha: false,
    tentativas_invalidas: 0,
    bloqueado_ate: '',
    criado_em: '',
    atualizado_em: '',
  },
  {
    id: 'user-setor-contabil',
    nome: 'Setor Contábil',
    email: 'contabil@f12contabilidade.com.br',
    senha_hash: '',
    cargo: 'Operacional',
    setor: 'Setor Contábil',
    perfil_acesso: ACCESS_PROFILE_KEYS.ACCOUNTING_OPERATIONAL,
    status: 'Ativo',
    ultimo_acesso: '',
    precisa_trocar_senha: false,
    tentativas_invalidas: 0,
    bloqueado_ate: '',
    criado_em: '',
    atualizado_em: '',
  },
];

export const ALLOWED_USER_EMAILS = INITIAL_USERS.map((user) => user.email);

export const USER_FIELDS = [
  'id',
  'auth_user_id',
  'nome',
  'email',
  'senha_hash',
  'cargo',
  'setor',
  'perfil_acesso',
  'status',
  'ultimo_acesso',
  'precisa_trocar_senha',
  'tentativas_invalidas',
  'bloqueado_ate',
  'criado_em',
  'atualizado_em',
];

export const RECOVERY_TOKEN_FIELDS = [
  'id',
  'usuario_id',
  'token_hash',
  'expira_em',
  'usado_em',
  'criado_em',
];

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
  'anexo_recibo_ecf',
  'precisa_ata',
  'ata_entregue',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
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
  'ata_entregue',
  'data_entrega_ata',
];

export const SIMPLE_OPERATIONAL_CLIENT_FIELDS = [
  'enviam_documentos',
  'ultima_competencia_enviada',
  'data_envio_documentos',
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
