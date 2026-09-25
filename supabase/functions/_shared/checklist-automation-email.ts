export type ChecklistAutomationItem = {
  ano?: unknown;
  mes?: unknown;
  item_descricao?: unknown;
};

export type ChecklistAutomationWork = {
  cliente_nome?: unknown;
  modo?: unknown;
  destinatario_original?: unknown;
  assunto?: unknown;
  itens_cobrados?: unknown;
};

type CompetenceGroup = {
  year: number;
  month: number;
  items: string[];
};

export function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function splitEmails(value: unknown) {
  return asText(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function groupChecklistItems(value: unknown): CompetenceGroup[] {
  if (!Array.isArray(value)) return [];

  const groups = new Map<string, CompetenceGroup>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as ChecklistAutomationItem;
    const year = asPositiveInteger(item.ano);
    const month = asPositiveInteger(item.mes);
    const description = asText(item.item_descricao);
    if (!year || month < 1 || month > 12 || !description) continue;

    const key = `${year}-${String(month).padStart(2, "0")}`;
    const group = groups.get(key) ?? { year, month, items: [] };
    if (!group.items.includes(description)) group.items.push(description);
    groups.set(key, group);
  }

  return [...groups.values()].sort(
    (left, right) => left.year - right.year || left.month - right.month,
  );
}

function formatCompetence(group: CompetenceGroup) {
  return `${String(group.month).padStart(2, "0")}/${group.year}`;
}

export function buildChecklistAutomationEmail(
  work: ChecklistAutomationWork,
  signatureName = "F12 Contabilidade",
) {
  const groups = groupChecklistItems(work.itens_cobrados);
  if (!groups.length) throw new Error("O trabalho nao possui itens validos para envio.");

  const normalizedSignature = asText(signatureName) || "F12 Contabilidade";
  const testMode = asText(work.modo).toUpperCase() === "TESTE";
  const originalRecipient = asText(work.destinatario_original);
  const testNoticeText = testMode
    ? `Envio de teste. Destinatario original: ${originalRecipient || "nao informado"}.`
    : "";
  const testNoticeHtml = testMode
    ? `<p style="padding:10px 12px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;"><strong>Envio de teste.</strong> Destinatário original: ${escapeHtml(originalRecipient || "não informado")}.</p>`
    : "";

  const textSections = groups.map((group) => [
    `${formatCompetence(group)}:`,
    ...group.items.map((description, index) => `• ${index + 1}) ${description}`),
  ].join("\n")).join("\n\n");

  const htmlSections = groups.map((group) => `
    <h3 style="margin:20px 0 6px;font-size:15px;">${formatCompetence(group)}</h3>
    <ul>${group.items.map((description, index) => `<li>${index + 1}) ${escapeHtml(description)}</li>`).join("")}</ul>
  `).join("");

  const text = [
    "Ola! Tudo bem?",
    testNoticeText,
    "",
    "Segue lembrete das documentacoes pendentes para fechamento contabil:",
    "",
    textSections,
    "",
    "Qualquer duvida, estamos a disposicao.",
    "",
    "Por favor, confirme o recebimento deste e-mail.",
    "",
    "Atenciosamente,",
    "",
    normalizedSignature,
  ].filter((line, index, lines) => line || lines[index - 1] !== "").join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Olá! Tudo bem?</p>
      ${testNoticeHtml}
      <p>Segue lembrete das documentações pendentes para fechamento contábil:</p>
      ${htmlSections}
      <p><strong>Qualquer dúvida, estamos à disposição.</strong></p>
      <p><strong>Por favor, confirme o recebimento deste e-mail.</strong></p>
      <p>Atenciosamente,</p>
      <p>${escapeHtml(normalizedSignature)}</p>
    </div>
  `.trim();

  return {
    subject: asText(work.assunto),
    text,
    html,
    groups,
  };
}

export function isTransientResendStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}
