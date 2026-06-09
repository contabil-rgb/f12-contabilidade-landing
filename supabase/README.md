# Supabase (fase atual)

Arquivos SQL ativos:

- `supabase/schema.sql` -> estrutura base (`clientes`, `listagens`)
- `supabase/seed.sql` -> listagens iniciais
- `supabase/auth-rls.sql` -> `usuarios` + Auth/RLS basico
- `supabase/usuarios-hardening.sql` -> reforco de seguranca para a gestao de usuarios com base no perfil do portal
- `supabase/usuarios-campos-gestao.sql` -> campos complementares da Gestao de Usuarios
- `supabase/historico.sql` -> tabela `historico_alteracoes` + RLS basico do historico
- `supabase/obrigacoes-status.sql` -> view persistente de status e pendencias de REINF / ECD / ECF
- `supabase/clientes-campos-operacionais.sql` -> colunas operacionais adicionais usadas pelo risco resumido
- `supabase/clientes-campos-acompanhamento.sql` -> datas e status operacionais de notificacao e retorno
- `supabase/acompanhamento-operacional.sql` -> view persistente de acompanhamento operacional do cliente
- `supabase/risco-operacional.sql` -> view persistente de risco operacional resumido
- `supabase/clientes-remover-legado-acompanhamento.sql` -> limpeza opcional para bases antigas que ainda tenham `proxima_acao` e `prazo_proxima_acao`

Ordem recomendada no SQL Editor:

1. `schema.sql`
2. `seed.sql`
3. `auth-rls.sql`
4. `usuarios-hardening.sql`
5. `usuarios-campos-gestao.sql`
6. `historico.sql`
7. `obrigacoes-status.sql`
8. `clientes-campos-operacionais.sql`
9. `clientes-campos-acompanhamento.sql`
10. `acompanhamento-operacional.sql`
11. `risco-operacional.sql`

Migracao opcional para bases ja existentes:

- depois de aplicar a versao nova de `acompanhamento-operacional.sql`, rode `clientes-remover-legado-acompanhamento.sql` para remover `proxima_acao` e `prazo_proxima_acao` da tabela `clientes`.
