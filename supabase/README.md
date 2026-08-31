# Supabase

Arquivos SQL ativos do projeto.

## Estrutura principal

- `supabase/schema.sql` -> estrutura base de `clientes` e `listagens`
- `supabase/seed.sql` -> categorias estaveis iniciais de listagens
- `supabase/auth-rls.sql` -> Auth + RLS basico de `clientes`, `listagens` e `usuarios`
- `supabase/clientes-hardening.sql` -> funcoes seguras para operacoes sensiveis em clientes
- `supabase/clientes-arquivamento.sql` -> colunas e funcoes seguras para arquivar/restaurar clientes sem excluir dados
- `supabase/listagens-gestao-responsaveis.sql` -> policies e carga inicial do catalogo de responsaveis
- `supabase/usuarios-hardening.sql` -> reforco de seguranca para a gestao de usuarios
- `supabase/usuarios-campos-gestao.sql` -> campos complementares da gestao de usuarios
- `supabase/historico.sql` -> tabela `historico_alteracoes` + policies
- `supabase/anexos.sql` -> tabela `anexos` + policies
- `supabase/storage.sql` -> bucket privado e policies de Storage
- `supabase/anexos-storage-hardening.sql` -> reforco das policies de anexos e Storage
- `supabase/contratos-sociais.sql` -> tabela e funcoes para Contrato Social versionado
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
5. `clientes-arquivamento.sql`
6. `listagens-gestao-responsaveis.sql`
7. `usuarios-hardening.sql`
8. `usuarios-campos-gestao.sql`
9. `historico.sql`
10. `anexos.sql`
11. `storage.sql`
12. `anexos-storage-hardening.sql`
13. `contratos-sociais.sql`
14. `obrigacoes-status.sql`
15. `clientes-campos-operacionais.sql`
16. `clientes-campos-acompanhamento.sql`
17. `acompanhamento-operacional.sql`
18. `risco-operacional.sql`

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
