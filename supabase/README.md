# Supabase (fase atual)

Arquivos SQL ativos:

- `supabase/schema.sql` -> estrutura base (`clientes`, `listagens`)
- `supabase/seed.sql` -> listagens iniciais
- `supabase/auth-rls.sql` -> `usuarios` + Auth/RLS basico
- `supabase/historico.sql` -> tabela `historico_alteracoes` + RLS basico do historico
- `supabase/obrigacoes-status.sql` -> view persistente de status e pendencias de REINF / ECD / ECF
- `supabase/clientes-campos-operacionais.sql` -> colunas operacionais adicionais usadas pelo risco resumido
- `supabase/risco-operacional.sql` -> view persistente de risco operacional resumido

Ordem recomendada no SQL Editor:

1. `schema.sql`
2. `seed.sql`
3. `auth-rls.sql`
4. `historico.sql`
5. `obrigacoes-status.sql`
6. `clientes-campos-operacionais.sql`
7. `risco-operacional.sql`
