type JsonRecord = Record<string, unknown>;

type ScheduledTest = {
  id?: unknown;
  token_reserva?: unknown;
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
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
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
  return value && typeof value === "object" ? value : null;
}

function internalHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
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

async function invokeWorker(
  supabaseUrl: string,
  internalApiKey: string,
  executionId: string,
  limit: number,
) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/processar-checklist-automacao`,
    {
      method: "POST",
      headers: internalHeaders(internalApiKey),
      body: JSON.stringify({ execucao_id: executionId, limite: limit }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(result, "Falha ao processar a fila direcionada."));
  }
  return result as JsonRecord;
}

async function finalize(
  supabaseUrl: string,
  serviceRoleKey: string,
  scheduleId: string,
  reservationToken: string,
  result: JsonRecord,
) {
  return await callRpc(
    supabaseUrl,
    serviceRoleKey,
    "finalizar_checklist_automacao_agendamento_teste_interno",
    {
      p_agendamento_id: scheduleId,
      p_token_reserva: reservationToken,
      p_resultado: result,
    },
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalApiKey = Deno.env.get("CHECKLIST_AUTOMACAO_INTERNAL_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !internalApiKey) {
    return jsonResponse({ error: "Configuracao interna do processador agendado incompleta." }, 500);
  }

  const suppliedKey = request.headers.get("apikey")?.trim() ?? "";
  if (!safeEquals(suppliedKey, internalApiKey)) {
    return jsonResponse({ error: "Credencial interna invalida." }, 403);
  }

  let payload: JsonRecord = {};
  try {
    payload = await request.json();
  } catch (_error) {
    // Corpo vazio usa os limites seguros padrao.
  }
  const scheduleLimit = Math.min(Math.max(asInteger(payload.limite_agendamentos, 1), 1), 5);
  const workLimit = Math.min(Math.max(asInteger(payload.limite_trabalhos, 10), 1), 10);
  const leaseMinutes = Math.min(
    Math.max(asInteger(payload.duracao_reserva_minutos, 10), 5),
    30,
  );

  let reservation: JsonRecord;
  try {
    reservation = ((await callRpc(
      supabaseUrl,
      serviceRoleKey,
      "reservar_checklist_automacao_agendamentos_teste_interno",
      {
        p_limite: scheduleLimit,
        p_duracao_reserva_minutos: leaseMinutes,
      },
    )) ?? {}) as JsonRecord;
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel reservar os testes agendados.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  if (reservation.bloqueada === true) {
    return jsonResponse({
      ok: true,
      bloqueada: true,
      motivo: reservation.motivo ?? null,
      reservados: 0,
      resultados: [],
    });
  }

  const schedules = Array.isArray(reservation.agendamentos)
    ? reservation.agendamentos as ScheduledTest[]
    : [];
  const results: JsonRecord[] = [];

  for (const schedule of schedules) {
    const scheduleId = asText(schedule.id);
    const reservationToken = asText(schedule.token_reserva);
    if (!scheduleId || !reservationToken) {
      results.push({
        ok: false,
        agendamento_id: scheduleId || null,
        erro_codigo: "RESERVA_INVALIDA",
      });
      continue;
    }

    try {
      const preparation = ((await callRpc(
        supabaseUrl,
        serviceRoleKey,
        "preparar_checklist_automacao_agendamento_teste_interno",
        {
          p_agendamento_id: scheduleId,
          p_token_reserva: reservationToken,
        },
      )) ?? {}) as JsonRecord;
      const execution = preparation.execucao as JsonRecord | undefined;
      const executionId = asText(execution?.id);
      if (!executionId) throw new Error("A preparacao nao retornou a execucao do teste.");

      const processing = await invokeWorker(
        supabaseUrl,
        internalApiKey,
        executionId,
        workLimit,
      );
      const finalization = await finalize(
        supabaseUrl,
        serviceRoleKey,
        scheduleId,
        reservationToken,
        { processamento: processing },
      );
      results.push({
        ok: true,
        agendamento_id: scheduleId,
        execucao_id: executionId,
        processamento: processing,
        finalizacao: finalization,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro nao informado.";
      let finalization: unknown = null;
      try {
        finalization = await finalize(
          supabaseUrl,
          serviceRoleKey,
          scheduleId,
          reservationToken,
          {
            erro_codigo: "PROCESSADOR_AGENDADO",
            erro_mensagem: message,
          },
        );
      } catch (finalizeError) {
        finalization = {
          erro: finalizeError instanceof Error
            ? finalizeError.message
            : "Nao foi possivel liberar o agendamento.",
        };
      }
      results.push({
        ok: false,
        agendamento_id: scheduleId,
        erro_codigo: "PROCESSADOR_AGENDADO",
        erro_mensagem: message,
        finalizacao: finalization,
      });
    }
  }

  return jsonResponse({
    ok: true,
    bloqueada: false,
    reservados: schedules.length,
    processados: results.filter((result) => result.ok === true).length,
    falhas: results.filter((result) => result.ok !== true).length,
    resultados: results,
  });
});
