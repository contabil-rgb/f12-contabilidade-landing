export const FIELD_DEFINITIONS = [
  { key: 'cnpj', label: 'CNPJ', group: 'Identificação', type: 'cnpj', required: true },
  { key: 'razao_social', label: 'Razão Social', group: 'Identificação', type: 'text', required: true },
  { key: 'nome_identificacao', label: 'Nome / Identificação', group: 'Identificação', type: 'text', required: true },
  { key: 'tipo_cliente', label: 'Tipo de Cliente', group: 'Identificação', type: 'select', listKey: 'tipo_cliente' },
  { key: 'regime_tributario', label: 'Regime Tributário', group: 'Identificação', type: 'select', listKey: 'regime_tributario' },
  { key: 'atividades', label: 'Atividades', group: 'Identificação', type: 'select', listKey: 'atividades' },
  { key: 'dificuldade', label: 'Dificuldade', group: 'Identificação', type: 'select', listKey: 'dificuldade' },

  { key: 'distribuicao_lucros', label: 'Distribuição de Lucros', group: 'REINF e Lucros', type: 'yesno' },
  { key: 'lucro', label: 'Lucro?', group: 'REINF e Lucros', type: 'yesno' },
  { key: 'envio_reinf', label: 'Envio de REINF', group: 'REINF e Lucros', type: 'yesno' },
  { key: 'data_enviada_reinf', label: 'Data enviada', group: 'REINF e Lucros', type: 'date' },
  { key: 'valor_lucro_acumulado', label: 'Valor Lucro Acumulado', group: 'REINF e Lucros', type: 'currency' },
  { key: 'anexo_recibo_reinf', label: 'Anexo do recibo da REINF', group: 'REINF e Lucros', type: 'attachment' },
  { key: 'anexo_recibo_lucros', label: 'Anexo do recibo de lucros', group: 'REINF e Lucros', type: 'attachment' },
  { key: 'precisa_ata', label: 'Precisa de ata', group: 'REINF e Lucros', type: 'yesno', hidden: true },
  { key: 'ata_entregue', label: 'Ata entregue', group: 'REINF e Lucros', type: 'yesno', hidden: true },
  { key: 'data_entrega_ata', label: 'Data de entrega da ata', group: 'REINF e Lucros', type: 'date', hidden: true },

  { key: 'ecd', label: 'ECD', group: 'ECD / ECF', type: 'yesno', listKey: 'ecd' },
  { key: 'ultima_ecd_entregue', label: 'Última ECD entregue', group: 'ECD / ECF', type: 'text' },
  { key: 'data_entrega_ecd', label: 'Data de entrega da ECD', group: 'ECD / ECF', type: 'date' },
  { key: 'data_envio_ecd', label: 'Data enviada da ECD', group: 'ECD / ECF', type: 'date' },
  { key: 'responsavel_ecd', label: 'Responsável pela ECD', group: 'ECD / ECF', type: 'text' },
  { key: 'anexo_recibo_ecd', label: 'Anexo do recibo da ECD', group: 'ECD / ECF', type: 'attachment' },
  { key: 'ecf', label: 'ECF', group: 'ECD / ECF', type: 'yesno' },
  { key: 'ultima_ecf_entregue', label: 'Última ECF entregue', group: 'ECD / ECF', type: 'text' },
  { key: 'anexo_recibo_ecf', label: 'Anexo do recibo da ECF', group: 'ECD / ECF', type: 'attachment' },

  { key: 'responsavel', label: 'Responsável', group: 'Responsáveis', type: 'select', listKey: 'responsavel' },
  { key: 'revisor', label: 'Revisor', group: 'Responsáveis', type: 'select', listKey: 'revisor' },

  { key: 'primeira_competencia', label: 'Primeira Competência', group: 'Status Contábil', type: 'text' },
  { key: 'tem_folha', label: 'Tem folha?', group: 'Status Contábil', type: 'yesno' },
  { key: 'ultima_importacao', label: 'Última importação', group: 'Status Contábil', type: 'date' },
  { key: 'ultima_competencia_entregue', label: 'Última Competência Entregue', group: 'Status Contábil', type: 'text' },
  { key: 'competencia_em_dia', label: 'Competência em Dia?', group: 'Status Contábil', type: 'select', listKey: 'competencia_em_dia' },
  { key: 'dias_atraso', label: 'Dias de Atraso', group: 'Status Contábil', type: 'number' },
  { key: 'situacao', label: 'Situação', group: 'Status Contábil', type: 'select', listKey: 'situacao' },

  { key: 'enviam_documentos', label: 'Envia documentos', group: 'Documentação', type: 'select', listKey: 'enviam_documentos' },
  { key: 'modo_entrega', label: 'Modo de Entrega', group: 'Documentação', type: 'select', listKey: 'modo_entrega' },
  { key: 'curva_envio', label: 'Curva de Envio', group: 'Documentação', type: 'select', listKey: 'curva_envio' },
  { key: 'ultima_competencia_enviada', label: 'Última competência enviada', group: 'Documentação', type: 'text' },
  { key: 'data_envio_documentos', label: 'Data de Envio', group: 'Documentação', type: 'date' },

  { key: 'revisado_coordenador', label: 'Revisado pelo Coordenador', group: 'Execução e Revisão', type: 'select', listKey: 'revisado_coordenador' },
  { key: 'lancamentos_padrao', label: 'Lançamentos Padrão', group: 'Execução e Revisão', type: 'select', listKey: 'lancamentos_padrao' },

  { key: 'motivo_atraso', label: 'Motivo do atraso', group: 'Alertas e Pendências', type: 'select', listKey: 'motivo_atraso' },
  { key: 'pendencia_tecnica', label: 'Pendência Técnica', group: 'Alertas e Pendências', type: 'yesno' },
  { key: 'cliente_notificado', label: 'Cliente Notificado', group: 'Alertas e Pendências', type: 'select', listKey: 'cliente_notificado' },
  { key: 'proxima_acao', label: 'Próxima Ação', group: 'Alertas e Pendências', type: 'textarea' },

  { key: 'criado_em', label: 'Criado em', group: 'Auditoria', type: 'date' },
  { key: 'atualizado_em', label: 'Atualizado em', group: 'Auditoria', type: 'date' },
];

export const EDITABLE_FIELDS = FIELD_DEFINITIONS.filter(
  (field) => !field.hidden && !['criado_em', 'atualizado_em'].includes(field.key),
);

export const FIELD_GROUPS = [
  'Identificação',
  'REINF e Lucros',
  'ECD / ECF',
  'Responsáveis',
  'Status Contábil',
  'Documentação',
  'Execução e Revisão',
  'Alertas e Pendências',
];

export const EXCEL_HEADER_MAP = {
  CNPJ: 'cnpj',
  'Razão Social': 'razao_social',
  Nome: 'nome_identificacao',
  'Tipo de Cliente': 'tipo_cliente',
  'Regime Tributário': 'regime_tributario',
  Atividades: 'atividades',
  Dificuldade: 'dificuldade',
  'Distribuição de Lucros': 'distribuicao_lucros',
  'Lucro?': 'lucro',
  'Envio de reinf': 'envio_reinf',
  'Envio de REINF': 'envio_reinf',
  'Data enviada': 'data_enviada_reinf',
  'Anexo do recibo da REINF': 'anexo_recibo_reinf',
  'Anexo do recibo de lucros': 'anexo_recibo_lucros',
  ECD: 'ecd',
  'Última ECD entregue': 'ultima_ecd_entregue',
  'Data de entrega da ECD': 'data_entrega_ecd',
  'Data enviada da ECD': 'data_envio_ecd',
  'Responsável pela ECD': 'responsavel_ecd',
  'Anexo do recibo da ECD': 'anexo_recibo_ecd',
  ECF: 'ecf',
  'Última ECF entregue': 'ultima_ecf_entregue',
  'Anexo do recibo da ECF': 'anexo_recibo_ecf',
  Responsável: 'responsavel',
  Revisor: 'revisor',
  'Primeira Competência': 'primeira_competencia',
  'Tem folha?': 'tem_folha',
  'Última importação': 'ultima_importacao',
  'Última Competência Entregue': 'ultima_competencia_entregue',
  'Competência em Dia?': 'competencia_em_dia',
  'Dias de Atraso': 'dias_atraso',
  Situação: 'situacao',
  'Valor Lucro Acumulado': 'valor_lucro_acumulado',
  'Precisa de Ata?': 'precisa_ata',
  'Ata entregue?': 'ata_entregue',
  'Data de entrega': 'data_entrega_ata',
  'Enviam Documentos': 'enviam_documentos',
  'Modo de Entrega': 'modo_entrega',
  'Modo de entrega': 'modo_entrega',
  'Curva de Envio': 'curva_envio',
  'Última competência enviada': 'ultima_competencia_enviada',
  'Data de Envio': 'data_envio_documentos',
  'Revisado pelo Coordenador (Analistas)': 'revisado_coordenador',
  'Revisado Pelo Coordenador': 'revisado_coordenador',
  'Lançamentos Padrão': 'lancamentos_padrao',
  'Lançamentos Padrão?': 'lancamentos_padrao',
  'Motivo do Atraso': 'motivo_atraso',
  'Motivo de Atraso': 'motivo_atraso',
  'Pendência Técnica': 'pendencia_tecnica',
  'Cliente Notificado': 'cliente_notificado',
  'Próxima Ação': 'proxima_acao',
};

export const LIST_HEADER_MAP = {
  'Tipo de Cliente': 'tipo_cliente',
  'Regime Tributário': 'regime_tributario',
  Atividades: 'atividades',
  Responsável: 'responsavel',
  Revisor: 'revisor',
  'Competência em dia?': 'competencia_em_dia',
  Situação: 'situacao',
  'Enviam Documentos': 'enviam_documentos',
  'Modo de entrega': 'modo_entrega',
  'Modo de Entrega': 'modo_entrega',
  'Curva de Envio': 'curva_envio',
  'Conciliações Realizadas': 'conciliacoes_realizadas',
  'Revisado Pelo Coordenador': 'revisado_coordenador',
  'Lançamentos Padrão?': 'lancamentos_padrao',
  'Motivo de Atraso': 'motivo_atraso',
  'Motivo do Atraso': 'motivo_atraso',
  'Risco de Multa': 'risco_multa',
  'Cliente Notificado': 'cliente_notificado',
  Dificuldade: 'dificuldade',
  ECD: 'ecd',
};

export const DEFAULT_LISTS = {
  tipo_cliente: ['Bodó', 'Tambaqui', 'Salmão'],
  regime_tributario: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Isento'],
  atividades: ['Comércio', 'Serviço', 'Comércio e Serviço', 'Indústria', 'Holding'],
  responsavel: [],
  revisor: [],
  competencia_em_dia: ['Sim', 'Não'],
  situacao: ['Em dia', 'Atrasado', 'Crítico', 'Culpa da F12', 'Inativo'],
  enviam_documentos: ['Sim', 'Parcialmente', 'Não'],
  modo_entrega: ['Manual', 'Conta Azul', 'Controle Interno'],
  curva_envio: ['Mensal', 'Trimestral', 'Semestral', 'Anual'],
  revisado_coordenador: ['Sim', 'Não'],
  lancamentos_padrao: ['Sim', 'Não'],
  motivo_atraso: ['Docs Atrasados', 'Falta de financeiro rodando', 'Cliente Novo', 'Desorganização Interna F12'],
  risco_multa: ['Alto', 'Médio', 'Baixo'],
  cliente_notificado: ['Sim', 'Não'],
  dificuldade: ['Baixa', 'Média', 'Alta', 'Altíssima'],
  ecd: ['Sim', 'Não'],
};

export const YES_NO_OPTIONS = ['Sim', 'Não'];

export const DATABASE_TABLES = {
  clientes_contabeis: FIELD_DEFINITIONS.map(({ key }) => key),
  tipos_cliente: ['id', 'nome'],
  regimes_tributarios: ['id', 'nome'],
  atividades: ['id', 'nome'],
  responsaveis: ['id', 'nome'],
  revisores: ['id', 'nome'],
  situacoes: ['id', 'nome'],
  modos_entrega: ['id', 'nome'],
  motivos_atraso: ['id', 'nome'],
  dificuldades: ['id', 'nome'],
};

export const TABLE_COLUMNS = FIELD_DEFINITIONS.filter(
  (field) => !field.hidden && !['criado_em', 'atualizado_em'].includes(field.key),
);

export const DETAIL_SECTIONS = [
  {
    title: 'Identificação',
    fields: ['cnpj', 'razao_social', 'nome_identificacao', 'tipo_cliente', 'regime_tributario', 'atividades', 'dificuldade'],
  },
  {
    title: 'Obrigações e Escrituração',
    fields: ['ecf', 'ultima_ecf_entregue', 'primeira_competencia', 'ultima_competencia_entregue', 'competencia_em_dia', 'dias_atraso', 'situacao'],
  },
  {
    title: 'ECD',
    fields: ['ecd', 'ultima_ecd_entregue', 'data_entrega_ecd', 'data_envio_ecd', 'responsavel_ecd', 'anexo_recibo_ecd'],
  },
  {
    title: 'REINF',
    fields: ['data_enviada_reinf', 'anexo_recibo_reinf', 'precisa_ata', 'ata_entregue', 'data_entrega_ata'],
  },
  {
    title: 'Documentação',
    fields: ['enviam_documentos', 'modo_entrega', 'curva_envio', 'ultima_competencia_enviada', 'data_envio_documentos'],
  },
  {
    title: 'Responsáveis e Revisão',
    fields: ['responsavel', 'revisor', 'revisado_coordenador', 'lancamentos_padrao'],
  },
  {
    title: 'Alertas e Pendências',
    fields: ['motivo_atraso', 'pendencia_tecnica', 'cliente_notificado', 'proxima_acao'],
  },
];

export const EMPTY_CLIENT = FIELD_DEFINITIONS.reduce((client, field) => {
  client[field.key] = '';
  return client;
}, {});
