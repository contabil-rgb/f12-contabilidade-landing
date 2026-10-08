import { supabase } from '../lib/supabase';
import {
  createCnpjConsultaService,
  type CnpjConsultaClient,
} from './cnpj-consulta.core';

export {
  CnpjConsultaError,
  type CnpjConsultaEmpresa,
  type CnpjConsultaErrorCode,
} from './cnpj-consulta.core';

const service = createCnpjConsultaService(supabase as CnpjConsultaClient);

export async function consultarCnpj(cnpj: unknown) {
  return service.consultar(cnpj);
}
