# Supabase (fase atual)

Arquivos SQL ativos:

- `supabase/schema.sql` -> estrutura base (`clientes`, `listagens`)
- `supabase/seed.sql` -> listagens iniciais
- `supabase/auth-rls.sql` -> `usuarios` + Auth/RLS basico
- `supabase/historico.sql` -> tabela `historico_alteracoes` + RLS basico do historico

Ordem recomendada no SQL Editor:

1. `schema.sql`
2. `seed.sql`
3. `auth-rls.sql`
4. `historico.sql`
