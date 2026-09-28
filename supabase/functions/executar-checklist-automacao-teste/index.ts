const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type PortalUser = {
  id?: unknown;
  nome?: unknown;
  email?: unknown;
  status?: unknown;
  perfil_acesso?: unknown;
};

type TestPayload = {
  competencia_referencia?: unknown;
  cliente_ids?: unknown;
  chave_requisicao?: unknown;
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function getApiErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as JsonRecord;
  return asText(record.message)
    || asText(record.error_description)
    || asText(record.error)
    || fallback;
}

function normalizeRpcResult(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value : null;
}

function normalizeClientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(asText).filter(Boolean))].sort();
}

export function validateManualTestPayload(payload: TestPayload) {
  const competence = asText(payload.competencia_referencia);
  const clientIds = normalizeClientIds(payload.cliente_ids);
  const requestKey = asText(payload.chave_requisicao);

  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(competence)) {
    throw new Error("A competencia deve usar o formato AAAA-MM-01.");
  }
  if (!clientIds.length) {
    throw new Error("Selecione ao menos um cliente para o teste.");
  }
  if (clientIds.length > 10) {
    throw new Error("Cada teste pode incluir no maximo 10 clientes.");
  }
  if (!clientIds.every(isUuid)) {
    throw new Error("A selecao contem um cliente invalido.");
  }
  if (requestKey.length < 8 || requestKey.length > 180) {
    throw new Error("A chave da requisicao deve conter entre 8 e 180 caracteres.");
  }

  return { competence, clientIds, requestKey };
}

async function getAuthUserId(
  supabaseUrl: string,
  anonKey: string,
  token: string,
) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "";
  const user = await response.json().catch(() => ({}));
  return asText(user?.id);
}

async function getPortalUser(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  authUserId: string,
) {
  const query = new URLSearchParams({
    select: "id,nome,email,status,perfil_acesso",
    auth_user_id: `eq.${authUserId}`,
    limit: "1",
  });
  const response = await fetch(
    `${supabaseUrl}/rest/v1/usuarios?${query.toString()}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] as PortalUser : null;
}

function canRunManualTest(user: PortalUser | null) {
  if (!user || !isUuid(asText(user.id))) return false;
  const status = asText(user.status).toLowerCase();
  const profile = asText(user.perfil_acesso).toLowerCase();
  return status === "ativo"
    && ["coordenador_administrador", "setor_contabil_operacional"].includes(profile);
}

async function callInternalRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  body: JsonRecord,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, `Falha ao executar ${functionName}.`));
  }
  return normalizeRpcResult(result);
}

async function invokeTargetedWorker(
  supabaseUrl: string,
  internalApiKey: string,
  executionId: string,
  limit: number,
) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/processar-checklist-automacao`,
    {
      method: "POST",
      headers: {
        apikey: internalApiKey,
        Authorization: `Bearer ${internalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        execucao_id: executionId,
        limite: limit,
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, "Falha ao processar o teste manual."));
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalApiKey = Deno.env.get("CHECKLIST_AUTOMACAO_INTERNAL_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !internalApiKey) {
    return jsonResponse({ error: "Configuracao interna do teste incompleta." }, 500);
  }

  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Sessao nao informada." }, 401);

  const authUserId = await getAuthUserId(supabaseUrl, anonKey, token);
  if (!authUserId) return jsonResponse({ error: "Sessao invalida ou expirada." }, 401);

  const portalUser = await getPortalUser(
    supabaseUrl,
    anonKey,
    token,
    authUserId,
  );
  if (!canRunManualTest(portalUser)) {
    return jsonResponse({ error: "Usuario sem permissao para executar o teste." }, 403);
  }

  let payload: TestPayload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "JSON invalido." }, 400);
  }

  const headerKey = asText(request.headers.get("Idempotency-Key"));
  if (!asText(payload.chave_requisicao) && headerKey) {
    payload.chave_requisicao = headerKey;
  }

  let normalized: ReturnType<typeof validateManualTestPayload>;
  try {
    normalized = validateManualTestPayload(payload);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Solicitacao de teste invalida.",
    }, 400);
  }

  let preparation: JsonRecord;
  try {
    preparation = ((await callInternalRpc(
      supabaseUrl,
      serviceRoleKey,
      "preparar_checklist_automacao_teste_interno",
      {
        p_competencia_referencia: normalized.competence,
        p_cliente_ids: normalized.clientIds,
        p_chave_requisicao: normalized.requestKey,
        p_iniciado_por: asText(portalUser?.id),
      },
    )) ?? {}) as JsonRecord;
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel preparar o teste da automacao.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 400);
  }

  const execution = preparation.execucao as JsonRecord | undefined;
  const executionId = asText(execution?.id);
  if (!isUuid(executionId)) {
    return jsonResponse({
      error: "A preparacao nao retornou uma execucao valida.",
      preparacao: preparation,
    }, 500);
  }

  let processing: unknown;
  try {
    processing = await invokeTargetedWorker(
      supabaseUrl,
      internalApiKey,
      executionId,
      normalized.clientIds.length,
    );
  } catch (error) {
    return jsonResponse({
      error: "O teste foi preparado, mas o processamento nao respondeu.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
      execucao_id: executionId,
      preparacao: preparation,
      processamento: null,
    }, 502);
  }

  return jsonResponse({
    ok: true,
    execucao_id: executionId,
    competencia_referencia: normalized.competence,
    cliente_ids: normalized.clientIds,
    duplicado: preparation.duplicado === true,
    solicitado_por: {
      id: asText(portalUser?.id),
      nome: asText(portalUser?.nome) || null,
      email: asText(portalUser?.email) || null,
    },
    preparacao: preparation,
    processamento: processing,
  });
});
