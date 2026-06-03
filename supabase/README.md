# Supabase (fase atual)

Arquivos SQL ativos:

- `supabase/schema.sql` -> estrutura base (`clientes`, `listagens`)
- `supabase/seed.sql` -> listagens iniciais
- `supabase/auth-rls.sql` -> `usuarios` + Auth/RLS basico
- `supabase/usuarios-campos-gestao.sql` -> campos complementares da Gestao de Usuarios
- `supabase/historico.sql` -> tabela `historico_alteracoes` + RLS basico do historico
- `supabase/clientes-followups.sql` -> tabela `clientes_followups` + RLS basico da timeline operacional
- `supabase/obrigacoes-status.sql` -> view persistente de status e pendencias de REINF / ECD / ECF
- `supabase/clientes-campos-operacionais.sql` -> colunas operacionais adicionais usadas pelo risco resumido
- `supabase/clientes-campos-acompanhamento.sql` -> datas e status operacionais de notificacao, retorno e prazo
- `supabase/acompanhamento-operacional.sql` -> view persistente de acompanhamento operacional do cliente
- `supabase/risco-operacional.sql` -> view persistente de risco operacional resumido

Ordem recomendada no SQL Editor:

1. `schema.sql`
2. `seed.sql`
3. `auth-rls.sql`
4. `usuarios-campos-gestao.sql`
5. `historico.sql`
6. `clientes-followups.sql`
7. `obrigacoes-status.sql`
8. `clientes-campos-operacionais.sql`
9. `clientes-campos-acompanhamento.sql`
10. `acompanhamento-operacional.sql`
11. `risco-operacional.sql`
