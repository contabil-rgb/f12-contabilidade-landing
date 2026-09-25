type JsonRecord = Record<string, unknown>;

type AutomationConfiguration = {
  ativa?: unknown;
  modo?: unknown;
  fuso_horario?: unknown;
  horario_local?: unknown;
};

type ManausDateTime = {
  date: string;
  competence: string;
  year: number;
  month: number;
  minutes: number;
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asInteger(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function getInternalApiKey(request: Request) {
  return request.headers.get("apikey")?.trim() ?? "";
}

function safeEquals(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
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
  return value && typeof value === "object" ? value : value;
}

function internalHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readConfiguration(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<AutomationConfiguration> {
  const query = new URLSearchParams({
    select: "ativa,modo,fuso_horario,horario_local",
    id: "eq.1",
    limit: "1",
  });
  const response = await fetch(
    `${supabaseUrl}/rest/v1/checklist_automacao_configuracao?${query.toString()}`,
    { headers: internalHeaders(serviceRoleKey) },
  );
  const result = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, "Falha ao consultar a configuracao da automacao."));
  }
  if (!Array.isArray(result) || !result.length) {
    throw new Error("Configuracao global da automacao nao encontrada.");
  }
  return result[0] as AutomationConfiguration;
}

async function callRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  body: JsonRecord,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: internalHeaders(serviceRoleKey),
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, `Falha ao executar ${functionName}.`));
  }
  return normalizeRpcResult(result);
}

export function getZonedDateTime(
  instant: Date,
  timeZone = "America/Manaus",
): ManausDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (![year, month, day, hour, minute].every(Number.isInteger)) {
    throw new Error("Nao foi possivel calcular a data local da automacao.");
  }
  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return {
    date: `${year}-${monthText}-${dayText}`,
    competence: `${year}-${monthText}-01`,
    year,
    month,
    minutes: hour * 60 + minute,
  };
}

export function parseTimeToMinutes(value: unknown) {
  const match = asText(value).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) throw new Error("Horario local da automacao invalido.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new Error("Horario local da automacao invalido.");
  }
  return hour * 60 + minute;
}

export function getCoordinationBlock(
  local: ManausDateTime,
  secondBusinessDay: string,
  scheduledMinutes: number,
) {
  if (local.date !== secondBusinessDay) return "FORA_DA_DATA";
  if (local.minutes < scheduledMinutes) return "ANTES_DO_HORARIO";
  return null;
}

async function invokeWorker(
  supabaseUrl: string,
  internalApiKey: string,
  limit: number,
) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/processar-checklist-automacao`,
    {
      method: "POST",
      headers: internalHeaders(internalApiKey),
      body: JSON.stringify({ limite: limit }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, "Falha ao acionar o processamento da fila."));
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalApiKey = Deno.env.get("CHECKLIST_AUTOMACAO_INTERNAL_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !internalApiKey) {
    return jsonResponse({ error: "Configuracao interna da coordenacao incompleta." }, 500);
  }
  if (!safeEquals(getInternalApiKey(request), internalApiKey)) {
    return jsonResponse({ error: "Credencial interna invalida." }, 403);
  }

  let payload: JsonRecord = {};
  try {
    payload = await request.json();
  } catch (_error) {
    // Corpo vazio usa o lote seguro padrao.
  }
  const requestedLimit = asInteger(payload.limite, 5);
  const limit = Math.min(Math.max(requestedLimit, 1), 10);

  let configuration: AutomationConfiguration;
  try {
    configuration = await readConfiguration(supabaseUrl, serviceRoleKey);
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel ler a configuracao da automacao.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  const mode = asText(configuration.modo).toUpperCase();
  const timeZone = asText(configuration.fuso_horario);
  if (!timeZone || timeZone !== "America/Manaus" || !["TESTE", "REAL"].includes(mode)) {
    return jsonResponse({ error: "Configuracao global da automacao invalida." }, 500);
  }

  let local: ManausDateTime;
  let scheduledMinutes: number;
  try {
    local = getZonedDateTime(new Date(), timeZone);
    scheduledMinutes = parseTimeToMinutes(configuration.horario_local);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Data local invalida.",
    }, 500);
  }

  if (configuration.ativa !== true) {
    return jsonResponse({
      ok: true,
      pausada: true,
      modo: mode,
      data_local: local.date,
      competencia_referencia: local.competence,
      preparacao: null,
      processamento: null,
    });
  }

  let secondBusinessDay: string;
  try {
    secondBusinessDay = asText(await callRpc(
      supabaseUrl,
      serviceRoleKey,
      "checklist_segundo_dia_util_manaus",
      { p_ano: local.year, p_mes: local.month },
    ));
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel calcular o segundo dia util.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  const coordinationBlock = getCoordinationBlock(
    local,
    secondBusinessDay,
    scheduledMinutes,
  );

  if (coordinationBlock === "FORA_DA_DATA") {
    return jsonResponse({
      ok: true,
      pausada: false,
      fora_da_data: true,
      data_local: local.date,
      segundo_dia_util: secondBusinessDay,
      competencia_referencia: local.competence,
      preparacao: null,
      processamento: null,
    });
  }

  if (coordinationBlock === "ANTES_DO_HORARIO") {
    return jsonResponse({
      ok: true,
      pausada: false,
      antes_do_horario: true,
      data_local: local.date,
      segundo_dia_util: secondBusinessDay,
      competencia_referencia: local.competence,
      preparacao: null,
      processamento: null,
    });
  }

  const idempotencyKey = `checklist:${local.competence.slice(0, 7)}:${mode.toLowerCase()}:agendado`;
  let preparation: unknown;
  try {
    preparation = await callRpc(
      supabaseUrl,
      serviceRoleKey,
      "preparar_checklist_automacao_interno",
      {
        p_competencia_referencia: local.competence,
        p_acionamento: "AGENDADO",
        p_chave_idempotencia: idempotencyKey,
      },
    );
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel preparar a execucao mensal.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  let processing: unknown;
  try {
    processing = await invokeWorker(supabaseUrl, internalApiKey, limit);
  } catch (error) {
    return jsonResponse({
      error: "A execucao foi preparada, mas o worker nao respondeu.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
      preparacao: preparation,
      processamento: null,
    }, 502);
  }

  return jsonResponse({
    ok: true,
    pausada: false,
    data_local: local.date,
    segundo_dia_util: secondBusinessDay,
    competencia_referencia: local.competence,
    chave_idempotencia: idempotencyKey,
    preparacao: preparation,
    processamento: processing,
  });
});
