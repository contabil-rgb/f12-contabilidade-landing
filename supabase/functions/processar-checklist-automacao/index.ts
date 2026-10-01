import {
  asText,
  buildChecklistAutomationEmail,
  isTransientResendStatus,
  isValidEmail,
  splitEmails,
  type ChecklistAutomationWork,
} from "../_shared/checklist-automation-email.ts";

type JsonRecord = Record<string, unknown>;

type QueueWork = ChecklistAutomationWork & {
  id?: unknown;
  token_reserva?: unknown;
  chave_idempotencia?: unknown;
  destinatario_efetivo?: unknown;
  cc_efetivo?: unknown;
  tentativa_atual?: unknown;
};

type Reservation = {
  quantidade?: unknown;
  trabalhos?: unknown;
  pausada?: unknown;
  automacao_global_pausada?: unknown;
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getInternalApiKey(request: Request) {
  return request.headers.get("apikey")?.trim() ?? "";
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

function asInteger(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeEquals(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function buildPublicSignatureUrl(supabaseUrl: string, path: unknown) {
  const normalizedPath = asText(path);
  if (!normalizedPath) return "";
  const encodedPath = normalizedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${supabaseUrl}/storage/v1/object/public/assinaturas-email/${encodedPath}`;
}

async function callRpc(
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

async function finalizeWithRetry(
  supabaseUrl: string,
  serviceRoleKey: string,
  workId: string,
  reservationToken: string,
  status: "ENVIADO" | "FALHOU" | "CANCELADO",
  result: JsonRecord,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await callRpc(
        supabaseUrl,
        serviceRoleKey,
        "finalizar_checklist_automacao_trabalho_interno",
        {
          p_trabalho_id: workId,
          p_token_reserva: reservationToken,
          p_status: status,
          p_resultado: result,
        },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Nao foi possivel finalizar o trabalho da automacao.");
}

async function failWork(
  supabaseUrl: string,
  serviceRoleKey: string,
  workId: string,
  reservationToken: string,
  code: string,
  message: string,
  transient: boolean,
) {
  return await finalizeWithRetry(
    supabaseUrl,
    serviceRoleKey,
    workId,
    reservationToken,
    "FALHOU",
    {
      erro_codigo: code,
      erro_mensagem: message,
      erro_transitorio: transient,
    },
  );
}

async function processWork(
  work: QueueWork,
  configuration: {
    supabaseUrl: string;
    serviceRoleKey: string;
    resendApiKey: string;
    fromEmail: string;
    bcc: string[];
    signatureName: string;
  },
) {
  const workId = asText(work.id);
  const reservationToken = asText(work.token_reserva);
  const idempotencyKey = asText(work.chave_idempotencia);
  const attempt = asInteger(work.tentativa_atual, 0);

  if (!workId || !reservationToken || !idempotencyKey) {
    return {
      ok: false,
      trabalho_id: workId || null,
      tentativa: attempt,
      erro_codigo: "TRABALHO_INVALIDO",
      erro_mensagem: "A reserva retornou um trabalho sem identificadores obrigatorios.",
    };
  }

  let start: unknown;
  try {
    start = await callRpc(
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
      "iniciar_checklist_automacao_envio_interno",
      {
        p_trabalho_id: workId,
        p_token_reserva: reservationToken,
      },
    );
  } catch (error) {
    return {
      ok: false,
      trabalho_id: workId,
      tentativa: attempt,
      incerto: true,
      erro_codigo: "INICIO_HISTORICO",
      erro_mensagem: error instanceof Error ? error.message : "Falha ao iniciar o historico.",
    };
  }

  const startRecord = (start ?? {}) as JsonRecord;
  if (startRecord.ja_enviado === true) {
    return { ok: true, trabalho_id: workId, tentativa: attempt, duplicado: true };
  }
  if (startRecord.cancelado === true) {
    return {
      ok: true,
      trabalho_id: workId,
      tentativa: attempt,
      cancelado: true,
      motivo: asText(startRecord.motivo) || "CLIENTE_INELEGIVEL",
    };
  }
  if (startRecord.adquirido !== true) {
    return {
      ok: false,
      trabalho_id: workId,
      tentativa: attempt,
      duplicado: true,
      erro_codigo: "TENTATIVA_JA_INICIADA",
      erro_mensagem: "Esta tentativa ja havia sido iniciada.",
    };
  }

  const to = splitEmails(work.destinatario_efetivo);
  const cc = splitEmails(work.cc_efetivo);
  const subject = asText(work.assunto);
  let content: ReturnType<typeof buildChecklistAutomationEmail>;

  try {
    if (!to.length || !to.every(isValidEmail)) {
      throw new Error("Destinatario efetivo invalido.");
    }
    if (cc.length && !cc.every(isValidEmail)) {
      throw new Error("Endereco em copia invalido.");
    }
    if (!subject) throw new Error("Assunto do lembrete nao informado.");

    const clientId = asText(work.cliente_id);
    if (!isUuid(clientId)) throw new Error("Cliente do trabalho nao informado.");
    const signature = ((await callRpc(
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
      "obter_checklist_automacao_assinatura_interno",
      { p_cliente_id: clientId },
    )) ?? {}) as JsonRecord;

    content = buildChecklistAutomationEmail({
      ...work,
      responsavel_nome: signature.responsavel_nome,
      assinatura_email_url: buildPublicSignatureUrl(
        configuration.supabaseUrl,
        signature.assinatura_email_path,
      ),
    }, configuration.signatureName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dados do trabalho invalidos.";
    try {
      await failWork(
        configuration.supabaseUrl,
        configuration.serviceRoleKey,
        workId,
        reservationToken,
        "DADOS_INVALIDOS",
        message,
        false,
      );
    } catch (finalizeError) {
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        incerto: true,
        erro_codigo: "FINALIZACAO_FALHOU",
        erro_mensagem: finalizeError instanceof Error ? finalizeError.message : message,
      };
    }
    return {
      ok: false,
      trabalho_id: workId,
      tentativa: attempt,
      erro_codigo: "DADOS_INVALIDOS",
      erro_mensagem: message,
    };
  }

  let resendResponse: Response;
  let resendResult: JsonRecord = {};
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: configuration.fromEmail,
        to,
        ...(cc.length ? { cc } : {}),
        ...(configuration.bcc.length ? { bcc: configuration.bcc } : {}),
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
    resendResult = await resendResponse.json().catch(() => ({}));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha de rede ao contatar o Resend.";
    try {
      const finalization = await failWork(
        configuration.supabaseUrl,
        configuration.serviceRoleKey,
        workId,
        reservationToken,
        "RESEND_REDE",
        message,
        true,
      );
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        erro_codigo: "RESEND_REDE",
        erro_mensagem: message,
        finalizacao: finalization,
      };
    } catch (finalizeError) {
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        incerto: true,
        erro_codigo: "FINALIZACAO_FALHOU",
        erro_mensagem: finalizeError instanceof Error ? finalizeError.message : message,
      };
    }
  }

  if (!resendResponse.ok) {
    const message = getApiErrorMessage(resendResult, "Erro nao informado pelo Resend.");
    const code = `RESEND_HTTP_${resendResponse.status}`;
    try {
      const finalization = await failWork(
        configuration.supabaseUrl,
        configuration.serviceRoleKey,
        workId,
        reservationToken,
        code,
        message,
        isTransientResendStatus(resendResponse.status),
      );
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        erro_codigo: code,
        erro_mensagem: message,
        finalizacao: finalization,
      };
    } catch (finalizeError) {
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        incerto: true,
        erro_codigo: "FINALIZACAO_FALHOU",
        erro_mensagem: finalizeError instanceof Error ? finalizeError.message : message,
      };
    }
  }

  const resendId = asText(resendResult.id);
  if (!resendId) {
    const message = "O Resend aceitou a requisicao sem retornar o identificador do e-mail.";
    try {
      const finalization = await failWork(
        configuration.supabaseUrl,
        configuration.serviceRoleKey,
        workId,
        reservationToken,
        "RESEND_RESPOSTA_INVALIDA",
        message,
        true,
      );
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        incerto: true,
        erro_codigo: "RESEND_RESPOSTA_INVALIDA",
        erro_mensagem: message,
        finalizacao: finalization,
      };
    } catch (finalizeError) {
      return {
        ok: false,
        trabalho_id: workId,
        tentativa: attempt,
        incerto: true,
        erro_codigo: "FINALIZACAO_FALHOU",
        erro_mensagem: finalizeError instanceof Error ? finalizeError.message : message,
      };
    }
  }

  try {
    await finalizeWithRetry(
      configuration.supabaseUrl,
      configuration.serviceRoleKey,
      workId,
      reservationToken,
      "ENVIADO",
      { email_resend_id: resendId },
    );
  } catch (error) {
    return {
      ok: false,
      trabalho_id: workId,
      tentativa: attempt,
      incerto: true,
      resend_id: resendId,
      erro_codigo: "FINALIZACAO_FALHOU",
      erro_mensagem: error instanceof Error ? error.message : "Falha ao concluir o trabalho.",
    };
  }

  return {
    ok: true,
    trabalho_id: workId,
    tentativa: attempt,
    duplicado: false,
    resend_id: resendId,
    destinatarios: to,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalApiKey = Deno.env.get("CHECKLIST_AUTOMACAO_INTERNAL_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("CHECKLIST_EMAIL_FROM")
    ?? Deno.env.get("REINF_EMAIL_FROM")
    ?? "";
  const bcc = splitEmails(Deno.env.get("CHECKLIST_EMAIL_BCC") ?? "");
  const signatureName = Deno.env.get("CHECKLIST_AUTOMACAO_ASSINATURA")
    ?? "F12 Contabilidade";

  if (!supabaseUrl || !serviceRoleKey || !internalApiKey || !resendApiKey || !fromEmail) {
    return jsonResponse({ error: "Configuracao interna da automacao incompleta." }, 500);
  }

  if (!safeEquals(getInternalApiKey(request), internalApiKey)) {
    return jsonResponse({ error: "Credencial interna invalida." }, 403);
  }

  let payload: JsonRecord = {};
  try {
    payload = await request.json();
  } catch (_error) {
    // Corpo vazio usa os limites seguros padrao.
  }

  const requestedLimit = asInteger(payload.limite, 5);
  const limit = Math.min(Math.max(requestedLimit, 1), 10);
  const requestedLease = asInteger(payload.duracao_reserva_minutos, 10);
  const leaseMinutes = Math.min(Math.max(requestedLease, 5), 30);
  const executionId = asText(payload.execucao_id);
  if (executionId && !isUuid(executionId)) {
    return jsonResponse({ error: "Identificador da execucao de teste invalido." }, 400);
  }
  const targeted = Boolean(executionId);

  let reservation: Reservation;
  try {
    reservation = ((await callRpc(
      supabaseUrl,
      serviceRoleKey,
      targeted
        ? "reservar_checklist_automacao_teste_interno"
        : "reservar_checklist_automacao_trabalhos_interno",
      targeted
        ? {
          p_execucao_id: executionId,
          p_limite: limit,
          p_duracao_reserva_minutos: leaseMinutes,
        }
        : {
          p_limite: limit,
          p_duracao_reserva_minutos: leaseMinutes,
        },
    )) ?? {}) as Reservation;
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel reservar trabalhos da automacao.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  if (reservation.pausada === true) {
    return jsonResponse({
      ok: true,
      pausada: true,
      direcionada: targeted,
      execucao_id: executionId || null,
      quantidade: 0,
      resultados: [],
    });
  }

  const works = Array.isArray(reservation.trabalhos)
    ? reservation.trabalhos as QueueWork[]
    : [];
  const results = [];
  for (const work of works) {
    results.push(await processWork(work, {
      supabaseUrl,
      serviceRoleKey,
      resendApiKey,
      fromEmail,
      bcc,
      signatureName,
    }));
  }

  return jsonResponse({
    ok: true,
    pausada: false,
    automacao_global_pausada: targeted
      ? reservation.automacao_global_pausada === true
      : false,
    direcionada: targeted,
    execucao_id: executionId || null,
    reservados: works.length,
    enviados: results.filter((result) => result.ok === true && result.cancelado !== true).length,
    cancelados: results.filter((result) => result.cancelado === true).length,
    falhas: results.filter((result) => result.ok !== true).length,
    resultados: results,
  });
});
