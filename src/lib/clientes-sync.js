import { formatCnpj, normalizeCnpj } from './formatters.js';
import { sanitizeResponsavelEcdByRegime } from './ecdRules.js';

export const CLIENT_SYNC_DB_FIELDS = [
  'cnpj',
  'razao_social',
  'nome_identificacao',
  'tipo_cliente',
  'regime_tributario',
  'atividades',
  'dificuldade',
  'lucro',
  'responsavel',
  'revisor',
  'primeira_competencia',
  'tem_folha',
  'ultima_importacao',
  'ultima_competencia_entregue',
  'situacao',
  'competencia_em_dia',
  'dias_atraso',
  'distribuicao_lucros',
  'envio_reinf',
  'data_enviada_reinf',
  'valor_lucro_acumulado',
  'precisa_ata',
  'ata_entregue',
  'data_entrega_ata',
  'ecd',
  'ultima_ecd_entregue',
  'data_entrega_ecd',
  'data_envio_ecd',
  'responsavel_ecd',
  'ecf',
  'ultima_ecf_entregue',
  'enviam_documentos',
  'modo_entrega',
  'curva_envio',
  'ultima_competencia_enviada',
  'data_envio_documentos',
  'revisado_coordenador',
  'lancamentos_padrao',
  'motivo_atraso',
  'pendencia_tecnica',
  'cliente_notificado',
  'data_notificacao_cliente',
  'status_retorno_cliente',
  'data_retorno_cliente',
  'status',
  'atualizado_em',
];

function toIsoDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNullableText(value) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

export function normalizeClienteRowForSync(input, options = {}) {
  const cnpjDigits = normalizeCnpj(input?.cnpj);
  const cnpj = cnpjDigits ? formatCnpj(cnpjDigits) : null;
  const razaoSocial = normalizeNullableText(input?.razao_social);

  if (!cnpj || !razaoSocial) return null;

  const payload = sanitizeResponsavelEcdByRegime({
    cnpj,
    razao_social: razaoSocial,
    nome_identificacao: normalizeNullableText(input?.nome_identificacao),
    tipo_cliente: normalizeNullableText(input?.tipo_cliente),
    regime_tributario: normalizeNullableText(input?.regime_tributario),
    atividades: normalizeNullableText(input?.atividades),
    dificuldade: normalizeNullableText(input?.dificuldade),
    lucro: normalizeNullableText(input?.lucro),
    responsavel: normalizeNullableText(input?.responsavel),
    revisor: normalizeNullableText(input?.revisor),
    primeira_competencia: normalizeNullableText(input?.primeira_competencia),
    tem_folha: normalizeNullableText(input?.tem_folha),
    ultima_importacao: toIsoDate(input?.ultima_importacao),
    ultima_competencia_entregue: normalizeNullableText(input?.ultima_competencia_entregue),
    situacao: normalizeNullableText(input?.situacao),
    competencia_em_dia: normalizeNullableText(input?.competencia_em_dia),
    dias_atraso: Number(input?.dias_atraso ?? 0) || 0,
    distribuicao_lucros: normalizeNullableText(input?.distribuicao_lucros),
    envio_reinf: normalizeNullableText(input?.envio_reinf),
    data_enviada_reinf: toIsoDate(input?.data_enviada_reinf),
    valor_lucro_acumulado: parseMoney(input?.valor_lucro_acumulado),
    precisa_ata: normalizeNullableText(input?.precisa_ata),
    ata_entregue: normalizeNullableText(input?.ata_entregue),
    data_entrega_ata: toIsoDate(input?.data_entrega_ata),
    ecd: normalizeNullableText(input?.ecd),
    ultima_ecd_entregue: normalizeNullableText(input?.ultima_ecd_entregue),
    data_entrega_ecd: toIsoDate(input?.data_entrega_ecd),
    data_envio_ecd: toIsoDate(input?.data_envio_ecd),
    responsavel_ecd: normalizeNullableText(input?.responsavel_ecd),
    ecf: normalizeNullableText(input?.ecf),
    ultima_ecf_entregue: normalizeNullableText(input?.ultima_ecf_entregue),
    enviam_documentos: normalizeNullableText(input?.enviam_documentos),
    modo_entrega: normalizeNullableText(input?.modo_entrega),
    curva_envio: normalizeNullableText(input?.curva_envio),
    ultima_competencia_enviada: normalizeNullableText(input?.ultima_competencia_enviada),
    data_envio_documentos: toIsoDate(input?.data_envio_documentos),
    revisado_coordenador: normalizeNullableText(input?.revisado_coordenador),
    lancamentos_padrao: normalizeNullableText(input?.lancamentos_padrao),
    motivo_atraso: normalizeNullableText(input?.motivo_atraso),
    pendencia_tecnica: normalizeNullableText(input?.pendencia_tecnica),
    cliente_notificado: normalizeNullableText(input?.cliente_notificado),
    data_notificacao_cliente: toIsoDate(input?.data_notificacao_cliente),
    status_retorno_cliente: normalizeNullableText(input?.status_retorno_cliente),
    data_retorno_cliente: toIsoDate(input?.data_retorno_cliente),
    status: normalizeNullableText(input?.status) || options.defaultStatus || 'Ativo',
    atualizado_em: options.updatedAt ?? new Date().toISOString(),
  });

  const sanitized = {};
  CLIENT_SYNC_DB_FIELDS.forEach((field) => {
    sanitized[field] = payload[field] ?? null;
  });
  return sanitized;
}
