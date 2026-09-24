# Inventário técnico — automação de lembretes do checklist

Data do levantamento: 24/09/2026  
Branch de trabalho: `codex/automacao-lembretes-checklist`

## Objetivo e limite desta etapa

Este documento registra a estrutura existente e os pontos de integração para a automação dos lembretes contábeis. A Etapa 1 não altera o banco, não publica Edge Functions, não cria agendamentos e não envia e-mails.

A futura automação de leitura da caixa de entrada e conciliação de documentos recebidos está fora do escopo atual.

## Estado inicial do repositório

- A branch `master` estava limpa e sincronizada com `origin/master` no commit `bbb387b`.
- A branch exclusiva `codex/automacao-lembretes-checklist` foi criada a partir desse ponto.
- Não havia alterações locais nem commits pendentes antes da criação da branch.

## Componentes existentes que serão reutilizados

### Checklist e pendências

- `checklist_itens`: catálogo geral de documentos.
- `checklist_clientes_itens`: itens gerais aplicáveis a cada cliente.
- `checklist_clientes_itens_personalizados`: documentos específicos por cliente.
- `checklist_status` e `checklist_status_personalizados`: situação mensal dos itens (`PENDENTE`, `OK`, `NA` e `ERP`).
- `checklist_contatos`: destinatário e cópia de cada cliente.
- `vw_checklist_pendencias` e `vw_checklist_resumo`: leitura usada atualmente pelo portal.

As views vigentes incluem os itens gerais e personalizados, mas projetam somente uma janela móvel de 12 meses até a competência atual.

### Envio manual

O portal monta a prévia e chama a Edge Function `enviar-lembrete-contabil`. O fluxo existente já oferece:

- validação do usuário autenticado;
- autorização para Coordenador e Setor Contábil;
- validação de destinatário, cópia, assunto e conteúdo;
- envio pelo Resend;
- reserva idempotente antes do envio;
- finalização como `ENVIADO` ou `FALHOU`;
- tratamento explícito para resultado incerto quando o Resend aceita o e-mail, mas o histórico não pode ser finalizado.

Os modelos de assunto e corpo do e-mail ainda estão no componente React `ChecklistPage.jsx`. Para o envio automático, essa montagem deverá ser extraída ou reproduzida em código compartilhado no servidor, evitando dependência do navegador.

### Histórico e idempotência

A tabela `checklist_envios` já possui os campos necessários para integrar a automação:

- cliente, CNPJ, competências e itens cobrados;
- destinatário, cópia e assunto;
- `origem` com suporte a `MANUAL` e `AUTOMATICO`;
- `status` com `PROCESSANDO`, `ENVIADO`, `FALHOU` e `CANCELADO`;
- número da tentativa;
- chave de idempotência única;
- `execucao_id`;
- identificador do Resend e informações de erro;
- responsável e datas de processamento.

Também já existe um índice único por execução e cliente para envios automáticos. A página Histórico de envios já filtra e apresenta registros automáticos, mesmo que ainda não existam execuções desse tipo.

### Perfis e permissões

Os perfis `coordenador_administrador` e `setor_contabil_operacional` atualmente possuem o mesmo conjunto de permissões no frontend. A Edge Function manual também aceita os dois perfis ativos.

Os controles futuros deverão repetir a validação no banco ou na Edge Function; a visibilidade do botão no frontend não será considerada proteção suficiente.

### Infraestrutura Supabase observada

- O projeto local está vinculado ao projeto Supabase de produção.
- As Edge Functions `enviar-lembrete-contabil` e `enviar-reinf-email` estão publicadas e ativas.
- Os nomes dos segredos necessários ao envio manual estão configurados no projeto, incluindo Resend, remetente do checklist e credenciais internas do Supabase. Nenhum valor de segredo foi registrado neste documento.
- Não há SQL versionado para `pg_cron`, `pg_net`, Vault ou fila de processamento.
- Não existe Edge Function versionada para coordenação mensal, trabalho em lote, resumo da execução ou webhook do Resend.

A disponibilidade das extensões na instância deverá ser confirmada por uma consulta de validação antes da migração que as utilizar. A ativação e o agendamento ficam para etapas posteriores.

## Regras já definidas para a implementação

- Execução no segundo dia útil de cada mês, às 08:00 em `America/Manaus`.
- Sábados, domingos e feriados nacionais, do Amazonas e de Manaus não contam como dia útil.
- Cobrar todas as competências anteriores que continuarem pendentes.
- Agrupar as pendências por cliente.
- Até três tentativas: 08:00, 08:15 e 08:45, somente para falhas transitórias.
- Controle global, modo de teste, simulação e controle individual por cliente.
- Clientes novos começam com a automação individual desativada.
- Coordenador e Setor Contábil terão os mesmos acessos, com confirmação reforçada e auditoria para ações críticas.
- No modo de teste, os envios serão redirecionados para `nattorocha04@gmail.com`, com cópia para `rocharenato2004@gmail.com`, assunto identificado com `[TESTE]` e preservação do destinatário original no histórico.
- O resumo de cada execução será enviado aos mesmos dois endereços, inclusive quando não houver falhas.
- A automação permanecerá globalmente desativada até a autorização final de ativação.

## Lacunas que exigem implementação

1. Configuração global da automação e configuração individual por cliente.
2. Calendário de feriados versionado e funções de cálculo de dia útil em Manaus.
3. Registro de execuções mensais, auditoria das configurações e proteção contra execução mensal duplicada.
4. Preparação transacional dos trabalhos por cliente.
5. Fila durável, reserva concorrente, processamento em lotes e horários de nova tentativa.
6. Edge Functions de coordenação e processamento, separadas do fluxo autenticado pelo navegador.
7. Modo de teste e simulação com rastreabilidade do destinatário original.
8. Resumo idempotente da execução.
9. Controles e indicadores no portal.
10. Webhook assinado do Resend para acompanhar entrega, atraso, devolução, bloqueio e reclamação.

## Pontos que precisam ser resolvidos na Etapa 2

### Competência inicial por cliente

A regra de cobrar todas as competências pendentes não pode usar indefinidamente a ausência de um registro em `checklist_status` como evidência de pendência. Sem um limite inicial, seriam geradas competências anteriores ao início da relação com o cliente ou à adoção do checklist.

A estrutura da Etapa 2 deverá registrar uma competência inicial válida para a automação de cada cliente. A migração poderá sugerir um valor a partir dos dados existentes, mas não ativará automaticamente os clientes. Isso preserva a decisão de revisar cada cliente antes de habilitá-lo.

### Separação entre usuário humano e processo automático

As RPCs atuais exigem um usuário autenticado do portal e registram o responsável humano. O trabalhador automático precisará de funções internas próprias, com privilégios mínimos, origem `AUTOMATICO`, identificação da execução e auditoria do processo. As RPCs públicas atuais não deverão ser abertas ao `service_role` como atalho genérico.

### Reutilização do conteúdo do e-mail

O conteúdo manual é produzido no frontend. A automação deverá usar uma fonte única de regras para assunto, competências, itens e conteúdo, reduzindo divergência entre envios manuais e automáticos. A apresentação pode continuar específica de cada canal, mas a seleção das pendências deve ser calculada no banco.

### Fila

Não há fila implementada. A Etapa 2 deve preparar as tabelas e contratos de dados sem iniciar processamento. A escolha final entre Supabase Queues (`pgmq`) e uma fila relacional controlada será confirmada conforme as extensões efetivamente disponíveis na instância.

## Sequência técnica confirmada

1. Etapa 2: estrutura aditiva de banco, configurações, calendário, execuções e auditoria, mantendo a automação desligada.
2. Etapa 3: preparação transacional e idempotente das pendências por cliente.
3. Etapa 4: fila, trabalhador em lotes, Resend e novas tentativas.
4. Etapa 5: coordenação e agendamentos, ainda desativados globalmente.
5. Etapa 6: controles no portal para os dois perfis e proteções de ações críticas.
6. Etapa 7: webhook de eventos do Resend.
7. Etapa 8: resumo da execução.
8. Etapa 9: testes controlados e revisão completa.
9. Etapa 10: publicação e ativação somente após autorização explícita.

## Critério de conclusão da Etapa 1

- Branch exclusiva criada.
- Fluxo manual, tabelas, views, RPCs, permissões, Edge Functions e segredos necessários inventariados.
- Componentes reutilizáveis e lacunas identificados.
- Nenhum envio, publicação, alteração de banco ou agendamento realizado.

## Etapa 2 preparada na branch

A migração `supabase/migrations/20260924110000_checklist_automacao_base.sql` e o script de validação `supabase/checklist-automacao-base-validacao.sql` foram adicionados após a conclusão do inventário. A migração mantém a automação global pausada, usa modo de teste e deixa todos os clientes desabilitados.

O calendário inicial cobre 2026 a 2030. O cálculo do segundo dia útil bloqueia anos ainda não preparados, evitando executar a automação com um calendário incompleto. A carga do ano seguinte deverá fazer parte da manutenção anual.

## Implementação da Etapa 3

A migração `supabase/migrations/20260924150000_checklist_automacao_preparacao.sql` implementa a preparação transacional e idempotente. Ela identifica todas as competências anteriores pendentes de cada cliente habilitado, cria um retrato imutável das competências, itens e destinatários e registra um trabalho por cliente. A preparação não chama a função de envio e não cria agendamento.

Itens adicionados ao checklist passam a valer a partir do mês de sua inclusão, no calendário de Manaus. Itens que já existiam antes desta etapa herdam a competência inicial configurada para o cliente, preservando o histórico que será revisado antes da habilitação.

As funções de seleção e preparação são internas e executáveis somente pelo `service_role`. O modo `SIMULACAO` permanece disponível mesmo com a automação global pausada e não persiste execuções ou trabalhos. Chamadas efetivas exigem a automação ativa; o acionamento agendado também exige que a data local seja o segundo dia útil.

O script `supabase/checklist-automacao-preparacao-validacao.sql` testa estrutura, RLS, permissões, simulação, destinatários de teste, ausência de envio e idempotência. Ele executa o cenário dentro de uma transação e aplica `ROLLBACK` no final.

Em 24/09/2026, a migração da Etapa 3 foi executada no Supabase de produção. As nove verificações retornaram `OK`; o cenário temporário foi desfeito pelo `ROLLBACK`, nenhum e-mail foi enviado e a automação permaneceu pausada.

Em 24/09/2026, a migração foi executada no Supabase de produção e as nove verificações do script de validação retornaram `OK`. Nenhuma execução foi criada e nenhum agendamento ou envio foi ativado.
