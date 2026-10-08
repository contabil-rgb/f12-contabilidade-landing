export type CnpjCompany = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  nomeIdentificacao: string;
  provedor: string;
  atualizadoEm: string | null;
};

export type CnpjCompanyProvider = {
  name: string;
  lookup(cnpj: string): Promise<CnpjCompany>;
};

export type CnpjLookupErrorCode =
  | "CNPJ_INVALIDO"
  | "CNPJ_NAO_ENCONTRADO"
  | "LIMITE_CONSULTAS"
  | "TEMPO_ESGOTADO"
  | "PROVEDOR_INDISPONIVEL"
  | "RESPOSTA_INVALIDA";

export class CnpjLookupError extends Error {
  readonly code: CnpjLookupErrorCode;
  readonly provider: string | null;
  readonly retryable: boolean;

  constructor(
    code: CnpjLookupErrorCode,
    message: string,
    options: { provider?: string; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CnpjLookupError";
    this.code = code;
    this.provider = options.provider ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function normalizeCnpjForLookup(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidCnpjForLookup(value: unknown) {
  const cnpj = normalizeCnpjForLookup(value);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (length: number) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(cnpj[12])
    && calculateDigit(13) === Number(cnpj[13]);
}

export async function consultarEmpresaPorCnpj(
  value: unknown,
  provider: CnpjCompanyProvider,
) {
  const cnpj = normalizeCnpjForLookup(value);
  if (!isValidCnpjForLookup(cnpj)) {
    throw new CnpjLookupError(
      "CNPJ_INVALIDO",
      "Informe um CNPJ valido antes de consultar.",
    );
  }

  return provider.lookup(cnpj);
}
