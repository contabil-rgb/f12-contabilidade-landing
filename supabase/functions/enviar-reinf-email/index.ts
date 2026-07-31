const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReinfEmailPayload = {
  assunto?: unknown;
  corpo_mensagem?: unknown;
  texto?: unknown;
  html_mensagem?: unknown;
  html?: unknown;
  relatorio?: Record<string, unknown>;
};

type PortalUser = {
  id: string;
  nome: string | null;
  email: string | null;
  status: string | null;
  perfil_acesso: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function getAuthUserId(supabaseUrl: string, anonKey: string, token: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;

  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PortalUser : null;
}

function canSendReinfEmail(user: PortalUser | null) {
  if (!user) return false;
  if (String(user.status ?? "").trim().toLowerCase() !== "ativo") return false;
  return [
    "coordenador_administrador",
    "setor_contabil_operacional",
  ].includes(String(user.perfil_acesso ?? "").trim());
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const fromEmail = Deno.env.get("REINF_EMAIL_FROM") ?? "";
  const toEmail = Deno.env.get("REINF_EMAIL_TO") ?? "";
  const bccEmail = Deno.env.get("REINF_EMAIL_BCC") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!resendApiKey || !fromEmail || !toEmail || !supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Configuracao de envio incompleta." }, 500);
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ error: "Sessao nao informada." }, 401);
  }

  const authUserId = await getAuthUserId(supabaseUrl, anonKey, token);
  const portalUser = await getPortalUser(supabaseUrl, anonKey, token, authUserId);

  if (!canSendReinfEmail(portalUser)) {
    return jsonResponse({ error: "Usuario sem permissao para enviar e-mail REINF." }, 403);
  }

  let payload: ReinfEmailPayload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "JSON invalido." }, 400);
  }

  const relatorio = payload.relatorio ?? {};
  const subject = asText(payload.assunto) || asText(relatorio.assunto);
  const html = asText(payload.html_mensagem) || asText(payload.html);
  const text = asText(payload.corpo_mensagem) || asText(payload.texto) || asText(relatorio.corpo_mensagem) || stripHtml(html);

  if (!subject) {
    return jsonResponse({ error: "Assunto do e-mail e obrigatorio." }, 400);
  }

  if (!html && !text) {
    return jsonResponse({ error: "Mensagem do e-mail e obrigatoria." }, 400);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      ...(bccEmail ? { bcc: [bccEmail] } : {}),
      subject,
      html: html || `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${text}</pre>`,
      text,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return jsonResponse({
      error: "Falha ao enviar e-mail pelo Resend.",
      details: result?.message ?? result?.error ?? "Erro nao informado.",
    }, 502);
  }

  return jsonResponse({
    ok: true,
    id: result?.id ?? null,
    to: toEmail,
    bcc: bccEmail || null,
    sent_by: portalUser?.email ?? portalUser?.nome ?? null,
  });
});
