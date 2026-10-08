import {
  CnpjLookupError,
  consultarEmpresaPorCnpj,
  type CnpjCompanyProvider,
} from "../_shared/cnpj-company.ts";
import { createCnpjWsProvider } from "../_shared/cnpj-ws-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type PortalUser = {
  id?: unknown;
  status?: unknown;
  perfil_acesso?: unknown;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type HandlerDependencies = {
  fetchImpl?: FetchLike;
  provider?: CnpjCompanyProvider;
};

function jsonResponse(body: JsonRecord, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function getAuthUserId(
  fetchImpl: FetchLike,
  supabaseUrl: string,
  anonKey: string,
  token: string,
) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "";
  const user = await response.json().catch(() => ({}));
  return asText(user?.id);
}

async function getPortalUser(
  fetchImpl: FetchLike,
  supabaseUrl: string,
  anonKey: string,
  token: string,
  authUserId: string,
) {
  const query = new URLSearchParams({
    select: "id,status,perfil_acesso",
    auth_user_id: `eq.${authUserId}`,
    limit: "1",
  });
  const response = await fetchImpl(
    `${supabaseUrl}/rest/v1/usuarios?${query.toString()}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] as PortalUser : null;
}

function canCreateClients(user: PortalUser | null) {
  if (!user) return false;
  const status = asText(user.status).toLowerCase();
  const profile = asText(user.perfil_acesso).toLowerCase();
  return status === "ativo" && [
    "coordenador_administrador",
    "setor_contabil_operacional",
  ].includes(profile);
}

function lookupErrorResponse(error: CnpjLookupError) {
  const statuses: Record<string, number> = {
    CNPJ_INVALIDO: 400,
    CNPJ_NAO_ENCONTRADO: 404,
    LIMITE_CONSULTAS: 429,
    TEMPO_ESGOTADO: 503,
    PROVEDOR_INDISPONIVEL: 503,
    RESPOSTA_INVALIDA: 502,
  };
  const headers = error.code === "LIMITE_CONSULTAS" ? { "Retry-After": "60" } : {};
  return jsonResponse({
    error: error.message,
    code: error.code,
    retryable: error.retryable,
  }, statuses[error.code] ?? 500, headers);
}

export function createConsultarCnpjHandler(
  dependencies: HandlerDependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const provider = dependencies.provider ?? createCnpjWsProvider({ fetchImpl });

  return async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Configuracao interna da consulta incompleta." }, 500);
    }

    const token = getBearerToken(request);
    if (!token) return jsonResponse({ error: "Sessao nao informada." }, 401);

    let authUserId = "";
    let portalUser: PortalUser | null = null;
    try {
      authUserId = await getAuthUserId(fetchImpl, supabaseUrl, anonKey, token);
      if (authUserId) {
        portalUser = await getPortalUser(
          fetchImpl,
          supabaseUrl,
          anonKey,
          token,
          authUserId,
        );
      }
    } catch (_error) {
      return jsonResponse({
        error: "Nao foi possivel validar a sessao neste momento.",
        code: "AUTENTICACAO_INDISPONIVEL",
        retryable: true,
      }, 503);
    }

    if (!authUserId) return jsonResponse({ error: "Sessao invalida ou expirada." }, 401);
    if (!canCreateClients(portalUser)) {
      return jsonResponse({ error: "Usuario sem permissao para consultar CNPJ." }, 403);
    }

    let payload: JsonRecord;
    try {
      payload = await request.json();
    } catch (_error) {
      return jsonResponse({ error: "JSON invalido." }, 400);
    }

    try {
      const company = await consultarEmpresaPorCnpj(payload.cnpj, provider);
      return jsonResponse({ ok: true, empresa: company });
    } catch (error) {
      if (error instanceof CnpjLookupError) return lookupErrorResponse(error);
      return jsonResponse({
        error: "Nao foi possivel consultar o CNPJ neste momento.",
        code: "CONSULTA_INDISPONIVEL",
        retryable: true,
      }, 503);
    }
  };
}

Deno.serve(createConsultarCnpjHandler());
