const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ChecklistReminderPayload = {
  destinatario?: unknown;
  cc?: unknown;
  assunto?: unknown;
  texto?: unknown;
  html?: unknown;
  cliente?: Record<string, unknown>;
  competencias?: unknown;
  pendencias?: unknown;
  chave_idempotencia?: unknown;
};

type PortalUser = {
  id: string;
  nome: string | null;
  email: string | null;
  status: string | null;
  perfil_acesso: string | null;
};

type ChecklistEnvio = {
  id?: unknown;
  status?: unknown;
  email_resend_id?: unknown;
};

type ReservaEnvio = {
  adquirido?: unknown;
  envio?: ChecklistEnvio;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function splitEmails(value: unknown) {
  return asText(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|table|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

function normalizeRpcResult(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value : null;
}

function getApiErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return asText(record.message) || asText(record.error_description) || asText(record.error) || fallback;
}

async function callRpc(supabaseUrl: string, anonKey: string, token: string, functionName: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getApiErrorMessage(result, `Falha ao executar ${functionName}.`));
  return normalizeRpcResult(result);
}

async function getAuthUserId(supabaseUrl: string, anonKey: string, token: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "";
  const user = await response.json();
  return asText(user?.id);
}

async function getPortalUser(supabaseUrl: string, anonKey: string, token: string, authUserId: string) {
  const query = new URLSearchParams({
    select: "id,nome,email,status,perfil_acesso",
    auth_user_id: `eq.${authUserId}`,
    limit: "1",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/usuarios?${query.toString()}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PortalUser : null;
}

function canSendChecklistReminder(user: PortalUser | null) {
  if (!user) return false;
  const status = String(user.status ?? "").trim().toLowerCase();
  const profile = String(user.perfil_acesso ?? "").trim().toLowerCase();
  return status === "ativo" && ["coordenador_administrador", "setor_contabil_operacional"].includes(profile);
}

async function finalizeWithRetry(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  envioId: string,
  status: "ENVIADO" | "FALHOU",
  result: Record<string, unknown>,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await callRpc(supabaseUrl, anonKey, token, "finalizar_checklist_envio_portal", {
        p_envio_id: envioId,
        p_status: status,
        p_resultado: result,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nao foi possivel finalizar o historico do envio.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Metodo nao permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: "Configuracao do Supabase incompleta." }, 500);

  const token = getBearerToken(request);
  if (!token) return jsonResponse({ error: "Sessao nao informada." }, 401);

  const authUserId = await getAuthUserId(supabaseUrl, anonKey, token);
  const portalUser = await getPortalUser(supabaseUrl, anonKey, token, authUserId);
  if (!canSendChecklistReminder(portalUser)) {
    return jsonResponse({ error: "Usuario sem permissao para enviar lembrete do checklist." }, 403);
  }

  let payload: ChecklistReminderPayload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "JSON invalido." }, 400);
  }

  const to = splitEmails(payload.destinatario);
  const cc = splitEmails(payload.cc);
  const subject = asText(payload.assunto);
  const html = asText(payload.html);
  const text = asText(payload.texto) || stripHtml(html);
  const clienteId = asText(payload.cliente?.id);
  const competencias = asArray(payload.competencias);
  const pendencias = asArray(payload.pendencias);
  // Mantem compatibilidade com a versao do portal publicada antes da
  // idempotencia. O frontend novo fornece uma chave estavel por previa.
  const idempotencyKey = asText(payload.chave_idempotencia) || crypto.randomUUID();

  if (!to.length || !to.every(isValidEmail)) return jsonResponse({ error: "Destinatario do lembrete invalido." }, 400);
  if (cc.length && !cc.every(isValidEmail)) return jsonResponse({ error: "E-mail em copia invalido." }, 400);
  if (!subject) return jsonResponse({ error: "Assunto do lembrete e obrigatorio." }, 400);
  if (!html && !text) return jsonResponse({ error: "Mensagem do lembrete e obrigatoria." }, 400);
  if (!clienteId || !competencias.length || !pendencias.length) {
    return jsonResponse({ error: "Cliente, competencias e pendencias sao obrigatorios." }, 400);
  }
  let reservation: ReservaEnvio;
  try {
    reservation = (await callRpc(supabaseUrl, anonKey, token, "reservar_checklist_envio_portal", {
      p_envio: {
        cliente_id: clienteId,
        competencias,
        itens_cobrados: pendencias,
        destinatario: to.join("; "),
        cc: cc.join("; "),
        assunto: subject,
        qtd_pendencias: pendencias.length,
        chave_idempotencia: idempotencyKey,
      },
    }) ?? {}) as ReservaEnvio;
  } catch (error) {
    return jsonResponse({
      error: "Nao foi possivel iniciar o historico do lembrete.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
    }, 500);
  }

  const envio = reservation.envio ?? {};
  const envioId = asText(envio.id);
  const envioStatus = asText(envio.status).toUpperCase();
  const acquired = reservation.adquirido === true;
  if (!envioId) return jsonResponse({ error: "Reserva do historico nao retornou um identificador." }, 500);

  if (!acquired) {
    if (envioStatus === "ENVIADO") {
      return jsonResponse({
        ok: true,
        duplicado: true,
        envio_id: envioId,
        id: asText(envio.email_resend_id) || null,
        to,
        cc,
        sent_by: portalUser?.email ?? portalUser?.nome ?? null,
      });
    }
    return jsonResponse({
      error: envioStatus === "PROCESSANDO"
        ? "Este lembrete ja esta sendo processado. Aguarde a conclusao."
        : "Esta solicitacao ja foi finalizada. Abra uma nova previa para tentar novamente.",
      envio_id: envioId,
      status: envioStatus,
    }, 409);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("CHECKLIST_EMAIL_FROM") ?? Deno.env.get("REINF_EMAIL_FROM") ?? "";
  const bccEmail = Deno.env.get("CHECKLIST_EMAIL_BCC") ?? "";
  if (!resendApiKey || !fromEmail) {
    const failure = { erro_codigo: "CONFIGURACAO_INCOMPLETA", erro_mensagem: "Configuracao de envio incompleta." };
    try {
      await finalizeWithRetry(supabaseUrl, anonKey, token, envioId, "FALHOU", failure);
    } catch (_error) {
      // A pagina de historico identificara reservas que permanecerem em processamento.
    }
    return jsonResponse({ error: failure.erro_mensagem, envio_id: envioId }, 500);
  }

  let response: Response;
  let result: Record<string, unknown> = {};
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to,
        ...(cc.length ? { cc } : {}),
        ...(bccEmail ? { bcc: splitEmails(bccEmail) } : {}),
        subject,
        html: html || `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${text}</pre>`,
        text,
      }),
    });
    result = await response.json().catch(() => ({}));
  } catch (error) {
    const failure = {
      erro_codigo: "RESEND_REDE",
      erro_mensagem: error instanceof Error ? error.message : "Falha de rede ao contatar o Resend.",
    };
    try {
      await finalizeWithRetry(supabaseUrl, anonKey, token, envioId, "FALHOU", failure);
    } catch (_finalizeError) {
      return jsonResponse({
        error: "O Resend nao confirmou o envio e o historico nao pôde ser finalizado.",
        details: failure.erro_mensagem,
        envio_id: envioId,
      }, 502);
    }
    return jsonResponse({ error: "Falha ao enviar lembrete pelo Resend.", details: failure.erro_mensagem, envio_id: envioId }, 502);
  }

  if (!response.ok) {
    const failure = {
      erro_codigo: `RESEND_HTTP_${response.status}`,
      erro_mensagem: getApiErrorMessage(result, "Erro nao informado pelo Resend."),
    };
    try {
      await finalizeWithRetry(supabaseUrl, anonKey, token, envioId, "FALHOU", failure);
    } catch (_finalizeError) {
      return jsonResponse({
        error: "O Resend recusou o envio e o historico nao pôde ser finalizado.",
        details: failure.erro_mensagem,
        envio_id: envioId,
      }, 502);
    }
    return jsonResponse({ error: "Falha ao enviar lembrete pelo Resend.", details: failure.erro_mensagem, envio_id: envioId }, 502);
  }

  const resendId = asText(result?.id);
  try {
    await finalizeWithRetry(supabaseUrl, anonKey, token, envioId, "ENVIADO", { email_resend_id: resendId });
  } catch (error) {
    return jsonResponse({
      error: "O e-mail foi aceito pelo Resend, mas o historico nao pôde ser finalizado. Nao envie novamente antes de conferir o registro.",
      details: error instanceof Error ? error.message : "Erro nao informado.",
      envio_id: envioId,
      delivery_uncertain: true,
      id: resendId || null,
    }, 500);
  }

  return jsonResponse({
    ok: true,
    duplicado: false,
    envio_id: envioId,
    id: resendId || null,
    to,
    cc,
    sent_by: portalUser?.email ?? portalUser?.nome ?? null,
  });
});
