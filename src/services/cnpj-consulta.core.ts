import { isValidCnpj, normalizeCnpjDigits } from '../lib/cnpj.js';

export type CnpjConsultaEmpresa = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  nomeIdentificacao: string;
  provedor: string;
  atualizadoEm: string | null;
};

export type CnpjConsultaErrorCode =
  | 'CNPJ_INVALIDO'
  | 'CNPJ_NAO_ENCONTRADO'
  | 'LIMITE_CONSULTAS'
  | 'TEMPO_ESGOTADO'
  | 'PROVEDOR_INDISPONIVEL'
  | 'RESPOSTA_INVALIDA'
  | 'SESSAO_AUSENTE'
  | 'SESSAO_EXPIRADA'
  | 'SEM_PERMISSAO'
  | 'AUTENTICACAO_INDISPONIVEL'
  | 'CONSULTA_INDISPONIVEL';

export class CnpjConsultaError extends Error {
  readonly code: CnpjConsultaErrorCode;
  readonly retryable: boolean;

  constructor(code: CnpjConsultaErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'CnpjConsultaError';
    this.code = code;
    this.retryable = retryable;
  }
}

type SupabaseError = {
  message?: unknown;
  context?: unknown;
};

export type CnpjConsultaClient = {
  auth: {
    getSession(): Promise<{
      data?: { session?: unknown } | null;
      error?: SupabaseError | null;
    }>;
  };
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> },
    ): Promise<{ data?: unknown; error?: SupabaseError | null }>;
  };
};

type FunctionErrorPayload = {
  error?: unknown;
  code?: unknown;
  retryable?: unknown;
};

const ERROR_MESSAGES: Partial<Record<CnpjConsultaErrorCode, string>> = {
  CNPJ_INVALIDO: 'CNPJ inválido. Confira os dígitos informados.',
  CNPJ_NAO_ENCONTRADO: 'CNPJ não encontrado na base consultada.',
  LIMITE_CONSULTAS: 'O limite temporário de consultas foi atingido. Aguarde um momento e tente novamente.',
  TEMPO_ESGOTADO: 'A consulta demorou mais que o esperado. Tente novamente em instantes.',
  PROVEDOR_INDISPONIVEL: 'O serviço de consulta de CNPJ está temporariamente indisponível.',
  RESPOSTA_INVALIDA: 'O serviço de consulta retornou dados inválidos. Preencha o cadastro manualmente.',
  SESSAO_AUSENTE: 'Sua sessão não está disponível. Entre novamente no Portal.',
  SESSAO_EXPIRADA: 'Sua sessão expirou. Entre novamente no Portal.',
  SEM_PERMISSAO: 'Seu usuário não possui permissão para consultar CNPJ.',
  AUTENTICACAO_INDISPONIVEL: 'Não foi possível validar sua sessão neste momento.',
  CONSULTA_INDISPONIVEL: 'Não foi possível consultar o CNPJ neste momento. O cadastro manual continua disponível.',
};

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeCompany(value: unknown): CnpjConsultaEmpresa {
  const record = asRecord(value);
  const cnpj = normalizeCnpjDigits(record?.cnpj);
  const razaoSocial = asText(record?.razaoSocial);
  const nomeFantasia = asText(record?.nomeFantasia);
  const nomeIdentificacao = asText(record?.nomeIdentificacao) || nomeFantasia || razaoSocial;
  const provedor = asText(record?.provedor);
  const atualizadoEm = asText(record?.atualizadoEm) || null;

  if (!isValidCnpj(cnpj) || !razaoSocial || !nomeIdentificacao || !provedor) {
    throw new CnpjConsultaError(
      'RESPOSTA_INVALIDA',
      ERROR_MESSAGES.RESPOSTA_INVALIDA as string,
    );
  }

  return {
    cnpj,
    razaoSocial,
    nomeFantasia,
    nomeIdentificacao,
    provedor,
    atualizadoEm,
  };
}

function statusFromContext(context: unknown) {
  const record = asRecord(context);
  const status = Number(record?.status ?? 0);
  return Number.isInteger(status) ? status : 0;
}

async function payloadFromContext(context: unknown) {
  if (!context || typeof context !== 'object' || !(context instanceof Response)) return null;
  try {
    return asRecord(await context.clone().json());
  } catch (_error) {
    return null;
  }
}

function knownCode(value: unknown): CnpjConsultaErrorCode | null {
  const code = asText(value) as CnpjConsultaErrorCode;
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? code : null;
}

async function toConsultaError(error: SupabaseError | null | undefined, data: unknown) {
  const directPayload = asRecord(data) as FunctionErrorPayload | null;
  const contextPayload = await payloadFromContext(error?.context) as FunctionErrorPayload | null;
  const payload = directPayload?.code ? directPayload : contextPayload;
  const status = statusFromContext(error?.context);
  const code = knownCode(payload?.code)
    ?? (status === 401 ? 'SESSAO_EXPIRADA' : null)
    ?? (status === 403 ? 'SEM_PERMISSAO' : null)
    ?? 'CONSULTA_INDISPONIVEL';
  const retryable = typeof payload?.retryable === 'boolean'
    ? payload.retryable
    : ['LIMITE_CONSULTAS', 'TEMPO_ESGOTADO', 'PROVEDOR_INDISPONIVEL', 'AUTENTICACAO_INDISPONIVEL', 'CONSULTA_INDISPONIVEL'].includes(code);

  return new CnpjConsultaError(
    code,
    ERROR_MESSAGES[code] ?? ERROR_MESSAGES.CONSULTA_INDISPONIVEL as string,
    retryable,
  );
}

export function createCnpjConsultaService(client: CnpjConsultaClient) {
  return {
    async consultar(cnpjValue: unknown): Promise<CnpjConsultaEmpresa> {
      if (!isValidCnpj(cnpjValue)) {
        throw new CnpjConsultaError(
          'CNPJ_INVALIDO',
          ERROR_MESSAGES.CNPJ_INVALIDO as string,
        );
      }

      const cnpj = normalizeCnpjDigits(cnpjValue);
      let sessionResult;
      try {
        sessionResult = await client.auth.getSession();
      } catch (_error) {
        throw new CnpjConsultaError(
          'AUTENTICACAO_INDISPONIVEL',
          ERROR_MESSAGES.AUTENTICACAO_INDISPONIVEL as string,
          true,
        );
      }

      if (sessionResult.error) {
        throw new CnpjConsultaError(
          'AUTENTICACAO_INDISPONIVEL',
          ERROR_MESSAGES.AUTENTICACAO_INDISPONIVEL as string,
          true,
        );
      }
      if (!sessionResult.data?.session) {
        throw new CnpjConsultaError(
          'SESSAO_AUSENTE',
          ERROR_MESSAGES.SESSAO_AUSENTE as string,
        );
      }

      let invocation;
      try {
        invocation = await client.functions.invoke('consultar-cnpj', {
          body: { cnpj },
        });
      } catch (_error) {
        throw new CnpjConsultaError(
          'CONSULTA_INDISPONIVEL',
          ERROR_MESSAGES.CONSULTA_INDISPONIVEL as string,
          true,
        );
      }

      const response = asRecord(invocation.data);
      if (invocation.error || response?.error || response?.ok !== true) {
        throw await toConsultaError(invocation.error, invocation.data);
      }

      return normalizeCompany(response.empresa);
    },
  };
}
