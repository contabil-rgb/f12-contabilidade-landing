# Supabase

Arquivos SQL ativos do projeto.

## Estrutura principal

- `supabase/schema.sql` -> estrutura base de `clientes` e `listagens`
- `supabase/seed.sql` -> categorias estaveis iniciais de listagens
- `supabase/auth-rls.sql` -> Auth + RLS basico de `clientes`, `listagens` e `usuarios`
- `supabase/usuarios-hardening.sql` -> reforco de seguranca para a gestao de usuarios
- `supabase/usuarios-campos-gestao.sql` -> campos complementares da gestao de usuarios
- `supabase/historico.sql` -> tabela `historico_alteracoes` + policies
- `supabase/anexos.sql` -> tabela `anexos` + policies
- `supabase/storage.sql` -> bucket privado e policies de Storage
- `supabase/obrigacoes-status.sql` -> view persistente de obrigacoes
- `supabase/clientes-campos-operacionais.sql` -> colunas operacionais complementares
- `supabase/clientes-campos-acompanhamento.sql` -> datas e status de notificacao e retorno
- `supabase/acompanhamento-operacional.sql` -> view persistente de acompanhamento
- `supabase/risco-operacional.sql` -> view persistente de risco resumido

## Ordem recomendada no SQL Editor

1. `schema.sql`
2. `seed.sql`
3. `auth-rls.sql`
4. `usuarios-hardening.sql`
5. `usuarios-campos-gestao.sql`
6. `historico.sql`
7. `anexos.sql`
8. `storage.sql`
9. `obrigacoes-status.sql`
10. `clientes-campos-operacionais.sql`
11. `clientes-campos-acompanhamento.sql`
12. `acompanhamento-operacional.sql`
13. `risco-operacional.sql`

## Scripts auxiliares para bases ja existentes

- `supabase/clientes-remover-legado-acompanhamento.sql`
  - remove `proxima_acao` e `prazo_proxima_acao` de bases antigas

- `supabase/listagens-ampliar-categorias.sql`
  - complementa categorias de listagens que antes dependiam mais do bootstrap local

## Validacao rapida

Use:

- `supabase/health-check.sql`

Esse script nao altera dados e ajuda a conferir:

- tabelas;
- contagens;
- RLS;
- policies;
- helper de coordenador;
- bucket e policies de anexos.
