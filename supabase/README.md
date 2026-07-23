# Supabase

Arquivos SQL ativos do projeto.

## Estrutura principal

- `supabase/schema.sql` -> estrutura base de `clientes` e `listagens`
- `supabase/seed.sql` -> categorias estaveis iniciais de listagens
- `supabase/auth-rls.sql` -> Auth + RLS basico de `clientes`, `listagens` e `usuarios`
- `supabase/clientes-hardening.sql` -> funcoes seguras para operacoes sensiveis em clientes
- `supabase/listagens-gestao-responsaveis.sql` -> policies e carga inicial do catalogo de responsaveis
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
4. `clientes-hardening.sql`
5. `listagens-gestao-responsaveis.sql`
6. `usuarios-hardening.sql`
7. `usuarios-campos-gestao.sql`
8. `historico.sql`
9. `anexos.sql`
10. `storage.sql`
11. `obrigacoes-status.sql`
12. `clientes-campos-operacionais.sql`
13. `clientes-campos-acompanhamento.sql`
14. `acompanhamento-operacional.sql`
15. `risco-operacional.sql`

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
