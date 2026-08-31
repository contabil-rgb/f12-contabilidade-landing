import { supabase } from '../lib/supabase';

const DOCUMENT_DIGITS_LENGTHS = new Set([11, 14]);
const DOCUMENT_MAX_DIGITS_LENGTH = 14;

function normalizeCpfDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, DOCUMENT_MAX_DIGITS_LENGTH);
}

function isCpfCnpjDigitsValid(value: unknown) {
  return DOCUMENT_DIGITS_LENGTHS.has(normalizeCpfDigits(value).length);
}

function normalizeSocioRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    cliente_id: row.cliente_id,
    nome: String(row.nome ?? '').trim(),
    cpf: normalizeCpfDigits(row.cpf),
    ordem: Number(row.ordem ?? 0) || 0,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function normalizeSociosPayload(socios: Array<Record<string, unknown>> = []) {
  const seenCpfs = new Set<string>();

  return socios
    .map((socio) => ({
      nome: String(socio?.nome ?? '').trim(),
      cpf: normalizeCpfDigits(socio?.cpf),
    }))
    .filter((socio) => socio.nome || socio.cpf)
    .filter((socio) => {
      if (!socio.cpf) return true;
      if (seenCpfs.has(socio.cpf)) return false;
      seenCpfs.add(socio.cpf);
      return true;
    });
}

export async function listarSociosClientes(clienteIds?: string[]) {
  let query = supabase
    .from('clientes_socios')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  const ids = [...new Set((clienteIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length) {
    query = query.in('cliente_id', ids);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Não foi possível carregar sócios dos clientes: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeSocioRow(row as Record<string, unknown>));
}

export async function salvarSociosCliente(clienteId: string, socios: Array<Record<string, unknown>> = []) {
  const id = String(clienteId ?? '').trim();
  if (!id) {
    throw new Error('Cliente inválido para salvar sócios.');
  }

  const payload = normalizeSociosPayload(socios);
  const invalid = payload.find((socio) => !isCpfCnpjDigitsValid(socio.cpf));
  if (invalid) {
    throw new Error('CPF/CNPJ do sócio deve ter 11 ou 14 dígitos.');
  }

  const { data, error } = await supabase.rpc('salvar_socios_cliente_portal', {
    p_cliente_id: id,
    p_socios: payload,
  });

  if (error) {
    throw new Error(`Não foi possível salvar sócios do cliente: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => normalizeSocioRow(row));
}
