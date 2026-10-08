import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadNewClientAttachments } from './new-client-attachments.js';

const client = {
  id: '5df05ef8-b062-445a-bfb1-5756a3ef6125',
  cnpj: '11.609.268/0001-41',
  nome_identificacao: 'AEV',
};

test('não envia nada quando o cadastro não possui anexos opcionais', async () => {
  let calls = 0;
  const result = await uploadNewClientAttachments({
    client,
    uploadAttachment: async () => {
      calls += 1;
    },
    serializeAttachment: (attachment) => attachment,
  });

  assert.strictEqual(result.client, client);
  assert.equal(calls, 0);
  assert.deepEqual(result.uploaded, []);
  assert.deepEqual(result.failures, []);
});

test('envia cartão CNPJ e QSA somente depois de receber o cliente persistido', async () => {
  const calls = [];
  const pendingAttachments = {
    cartao_cnpj: { name: 'cartao-cnpj.pdf' },
    cartao_qsa: { name: 'cartao-qsa.pdf' },
  };

  const result = await uploadNewClientAttachments({
    client,
    pendingAttachments,
    uploadAttachment: async (params) => {
      calls.push(params);
      return { id: `anexo-${params.tipoAnexo}`, nome_arquivo: params.file.name };
    },
    serializeAttachment: (attachment) => JSON.stringify(attachment),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].cliente.id, client.id);
  assert.equal(calls[1].cliente.id, client.id);
  assert.equal(JSON.parse(result.client.anexo_cartao_cnpj).nome_arquivo, 'cartao-cnpj.pdf');
  assert.equal(JSON.parse(result.client.anexo_cartao_qsa).nome_arquivo, 'cartao-qsa.pdf');
  assert.equal(result.uploaded.length, 2);
  assert.deepEqual(result.failures, []);
});

test('mantém o cliente criado e informa falha isolada de um anexo', async () => {
  const result = await uploadNewClientAttachments({
    client,
    pendingAttachments: {
      cartao_cnpj: { name: 'cartao-cnpj.pdf' },
      cartao_qsa: { name: 'cartao-qsa.pdf' },
    },
    uploadAttachment: async ({ tipoAnexo, file }) => {
      if (tipoAnexo === 'cartao_cnpj') throw new Error('Storage indisponível');
      return { id: 'anexo-qsa', nome_arquivo: file.name };
    },
    serializeAttachment: (attachment) => JSON.stringify(attachment),
  });

  assert.equal(result.client.id, client.id);
  assert.equal(result.client.anexo_cartao_cnpj, undefined);
  assert.equal(JSON.parse(result.client.anexo_cartao_qsa).nome_arquivo, 'cartao-qsa.pdf');
  assert.equal(result.uploaded.length, 1);
  assert.deepEqual(result.failures, [{
    tipoAnexo: 'cartao_cnpj',
    fileName: 'cartao-cnpj.pdf',
    message: 'Storage indisponível',
  }]);
});
