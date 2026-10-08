import {
  CnpjLookupError,
  type CnpjCompany,
  type CnpjCompanyProvider,
} from "./cnpj-company.ts";

const PROVIDER_NAME = "CNPJ.ws";
const PUBLIC_API_URL = "https://publica.cnpj.ws/cnpj";
const DEFAULT_TIMEOUT_MS = 8_000;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CnpjWsPayload = {
  razao_social?: unknown;
  atualizado_em?: unknown;
  estabelecimento?: {
    cnpj?: unknown;
    nome_fantasia?: unknown;
    atualizado_em?: unknown;
  } | null;
};

export type CnpjWsProviderOptions = {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProviderCnpj(value: unknown) {
  return asText(value).replace(/\D/g, "");
}

function mapCnpjWsPayload(payload: unknown, requestedCnpj: string): CnpjCompany {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CnpjLookupError(
      "RESPOSTA_INVALIDA",
      "O provedor retornou uma resposta invalida.",
      { provider: PROVIDER_NAME },
    );
  }

  const data = payload as CnpjWsPayload;
  const legalName = asText(data.razao_social);
  const establishment = data.estabelecimento && typeof data.estabelecimento === "object"
    ? data.estabelecimento
    : null;
  const providerCnpj = normalizeProviderCnpj(establishment?.cnpj);
  const fantasyName = asText(establishment?.nome_fantasia);

  if (!legalName || (providerCnpj && providerCnpj !== requestedCnpj)) {
    throw new CnpjLookupError(
      "RESPOSTA_INVALIDA",
      "O provedor retornou dados cadastrais incompletos ou inconsistentes.",
      { provider: PROVIDER_NAME },
    );
  }

  return {
    cnpj: requestedCnpj,
    razaoSocial: legalName,
    nomeFantasia: fantasyName,
    nomeIdentificacao: fantasyName || legalName,
    provedor: PROVIDER_NAME,
    atualizadoEm: asText(establishment?.atualizado_em) || asText(data.atualizado_em) || null,
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CnpjLookupError(
      "RESPOSTA_INVALIDA",
      "O provedor retornou uma resposta que nao pode ser interpretada.",
      { provider: PROVIDER_NAME, cause: error },
    );
  }
}

function providerHttpError(status: number) {
  if (status === 404) {
    return new CnpjLookupError(
      "CNPJ_NAO_ENCONTRADO",
      "CNPJ nao encontrado no provedor.",
      { provider: PROVIDER_NAME },
    );
  }
  if (status === 429) {
    return new CnpjLookupError(
      "LIMITE_CONSULTAS",
      "O limite temporario de consultas foi atingido.",
      { provider: PROVIDER_NAME, retryable: true },
    );
  }
  return new CnpjLookupError(
    "PROVEDOR_INDISPONIVEL",
    "O provedor de CNPJ esta temporariamente indisponivel.",
    { provider: PROVIDER_NAME, retryable: status === 408 || status >= 500 },
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function createCnpjWsProvider(
  options: CnpjWsProviderOptions = {},
): CnpjCompanyProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? PUBLIC_API_URL).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: PROVIDER_NAME,
    async lookup(cnpj: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${baseUrl}/${cnpj}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) throw providerHttpError(response.status);
        return mapCnpjWsPayload(await readJson(response), cnpj);
      } catch (error) {
        if (error instanceof CnpjLookupError) throw error;
        if (isAbortError(error)) {
          throw new CnpjLookupError(
            "TEMPO_ESGOTADO",
            "A consulta de CNPJ excedeu o tempo limite.",
            { provider: PROVIDER_NAME, retryable: true, cause: error },
          );
        }
        throw new CnpjLookupError(
          "PROVEDOR_INDISPONIVEL",
          "Nao foi possivel conectar ao provedor de CNPJ.",
          { provider: PROVIDER_NAME, retryable: true, cause: error },
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
