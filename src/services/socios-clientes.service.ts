import { supabase } from '../lib/supabase';

const CPF_DIGITS_LENGTH = 11;

function normalizeCpfDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, CPF_DIGITS_LENGTH);
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
    throw new Error(`NÃ£o foi possÃ­vel carregar sÃ³cios dos clientes: ${error.message}`);
  }

  return (data ?? []).map((row) => normalizeSocioRow(row as Record<string, unknown>));
}

export async function salvarSociosCliente(clienteId: string, socios: Array<Record<string, unknown>> = []) {
  const id = String(clienteId ?? '').trim();
  if (!id) {
    throw new Error('Cliente invÃ¡lido para salvar sÃ³cios.');
  }

  const payload = normalizeSociosPayload(socios);
  const invalid = payload.find((socio) => socio.cpf.length !== CPF_DIGITS_LENGTH);
  if (invalid) {
    throw new Error('CPF do sÃ³cio deve ter 11 dÃ­gitos.');
  }

  const { data, error } = await supabase.rpc('salvar_socios_cliente_portal', {
    p_cliente_id: id,
    p_socios: payload,
  });

  if (error) {
    throw new Error(`NÃ£o foi possÃ­vel salvar sÃ³cios do cliente: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => normalizeSocioRow(row));
}
