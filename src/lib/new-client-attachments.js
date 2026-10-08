export const NEW_CLIENT_ATTACHMENT_FIELD_BY_TYPE = {
  cartao_cnpj: 'anexo_cartao_cnpj',
  cartao_qsa: 'anexo_cartao_qsa',
};

export async function uploadNewClientAttachments({
  client,
  pendingAttachments = {},
  uploadAttachment,
  serializeAttachment,
}) {
  let nextClient = client;
  const uploaded = [];
  const failures = [];

  for (const [tipoAnexo, fieldKey] of Object.entries(NEW_CLIENT_ATTACHMENT_FIELD_BY_TYPE)) {
    const file = pendingAttachments[tipoAnexo];
    if (!file) continue;

    try {
      const attachment = await uploadAttachment({
        cliente: nextClient,
        tipoAnexo,
        file,
      });
      nextClient = {
        ...nextClient,
        [fieldKey]: serializeAttachment(attachment),
      };
      uploaded.push({ tipoAnexo, attachment });
    } catch (error) {
      failures.push({
        tipoAnexo,
        fileName: String(file?.name ?? '').trim(),
        message: error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.',
      });
    }
  }

  return { client: nextClient, uploaded, failures };
}
