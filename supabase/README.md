# Supabase (fase atual)

Arquivos SQL ativos:

- `supabase/schema.sql` -> estrutura base (`clientes`, `listagens`)
- `supabase/seed.sql` -> listagens iniciais
- `supabase/auth-rls.sql` -> `usuarios` + Auth/RLS basico
- `supabase/usuarios-campos-gestao.sql` -> campos complementares da Gestao de Usuarios
- `supabase/historico.sql` -> tabela `historico_alteracoes` + RLS basico do historico
- `supabase/clientes-followups.sql` -> tabela `clientes_followups` + RLS basico da timeline operacional
- `supabase/followups-resumo.sql` -> view persistente de resumo de follow-ups por cliente
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
7. `followups-resumo.sql`
8. `obrigacoes-status.sql`
9. `clientes-campos-operacionais.sql`
10. `clientes-campos-acompanhamento.sql`
11. `acompanhamento-operacional.sql`
12. `risco-operacional.sql`
