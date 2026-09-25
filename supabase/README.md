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
- `supabase/migrations/20260924110000_checklist_automacao_base.sql` -> configuracao, calendario, execucoes e auditoria da automacao de lembretes, inicialmente pausada
- `supabase/checklist-automacao-base-validacao.sql` -> validacao somente leitura da base da automacao
- `supabase/migrations/20260924150000_checklist_automacao_preparacao.sql` -> selecao de pendencias e preparacao transacional e idempotente, sem envio de e-mails
- `supabase/checklist-automacao-preparacao-validacao.sql` -> validacao transacional da preparacao; desfaz todos os dados de teste com `ROLLBACK`
- `supabase/migrations/20260924180000_checklist_automacao_fila.sql` -> fila relacional, reserva concorrente, historico automatico e controle de novas tentativas
- `supabase/checklist-automacao-fila-validacao.sql` -> validacao transacional da fila; simula falhas sem enviar e-mails e desfaz o ciclo com `ROLLBACK`
- `supabase/functions/processar-checklist-automacao/index.ts` -> trabalhador interno da fila; envia pelo Resend com idempotencia e registra sucesso, falha ou nova tentativa
- `supabase/functions/_shared/checklist-automation-email.ts` -> montagem e validacao do e-mail automatico agrupado por competencia
- `supabase/functions/coordenar-checklist-automacao/index.ts` -> coordenacao mensal interna; respeita pausa, data e horario de Manaus antes de preparar e acionar o worker
- `supabase/migrations/20260925110000_checklist_automacao_agendamento.sql` -> agenda a coordenacao diaria as 08:00 de Manaus e o processamento da fila durante a janela de novas tentativas, com credenciais no Vault
- `supabase/checklist-automacao-agendamento-validacao.sql` -> validacao somente leitura das extensoes, segredos, protecoes e dois agendamentos
- `supabase/checklist-automacao-integrada-validacao.sql` -> validacao transacional do ciclo mensal completo, lotes, idempotencia, pausa e tentativas de 08:15 e 08:45; nao chama o Resend e desfaz os dados simulados
- `supabase/migrations/20260925150000_checklist_automacao_portal_controles.sql` -> RPCs protegidas para os dois perfis consultarem e administrarem configuracao, clientes, feriados e simulacoes pelo portal
- `supabase/checklist-automacao-portal-controles-validacao.sql` -> validacao transacional das permissoes equivalentes, confirmacoes, auditoria e rollback dos controles do portal
- `npm run supabase:configure:checklist-scheduling` -> sincroniza a chave secreta interna entre as Edge Functions e o Vault sem registrar seu valor no repositorio

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

- `supabase/clientes-exclusao-arquivados.sql`
  - cria a funcao segura para excluir definitivamente clientes arquivados/inativos
  - execute depois de `anexos.sql`, `contratos-sociais.sql` e `reinf-relatorios.sql`

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
