export type PerfilAcesso = 'coordenador_administrador' | 'setor_contabil_operacional';
export type StatusUsuario = 'Ativo' | 'Inativo';

export type UsuarioPerfil = {
  id: string;
  auth_user_id?: string | null;
  nome: string;
  email: string;
  perfil_acesso: PerfilAcesso;
  status: StatusUsuario;
  ultimo_acesso?: string | null;
  precisa_trocar_senha?: boolean | null;
  tentativas_invalidas?: number | null;
  bloqueado_ate?: string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
};
