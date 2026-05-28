# Portal de Gestao Contabil

Frontend em React + Vite para controle da carteira contabil.

## Fase atual da integracao

Nesta fase o portal usa:

- `public.clientes`
- `public.listagens`
- login com Supabase Auth
- RLS basico (usuarios autenticados e ativos)
- historico persistente em `public.historico_alteracoes`

Ainda **nao** faz parte desta fase:

- remocao fisica de anexos no Storage
- regras avancadas de permissao por campo
- politicas RLS detalhadas por perfil

## 1) Configurar variaveis de ambiente

Crie/edite `C:\Users\F12 CONTABILIDADE 13\Documents\New project\.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Preencha com os valores do seu projeto Supabase (Project URL + anon key).

## 2) Criar estrutura no Supabase

No SQL Editor do Supabase, execute nesta ordem:

1. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\schema.sql`
2. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\seed.sql`
3. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\auth-rls.sql`
4. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\historico.sql`
5. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\anexos.sql`
6. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\storage.sql`
7. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\usuarios-hardening.sql` (recomendado)
8. `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\obrigacoes-status.sql`

## 3) Criar usuarios no Supabase Auth e vincular perfis

No painel do Supabase:

1. Acesse `Authentication > Users`.
2. Crie os dois usuarios:
   - `leticiacampos@f12contabilidade.com.br`
   - `contabil@f12contabilidade.com.br`
3. Copie o `UUID` de cada usuario criado.
4. No SQL Editor, vincule em `public.usuarios`:

```sql
update public.usuarios
set auth_user_id = 'UUID_DO_USUARIO_AUTH'
where email = 'leticiacampos@f12contabilidade.com.br';

update public.usuarios
set auth_user_id = 'UUID_DO_USUARIO_AUTH'
where email = 'contabil@f12contabilidade.com.br';
```

Sem esse vinculo, o login autentica no Auth mas o portal bloqueia acesso por falta de perfil ativo.

## 4) Rodar localmente

```bash
npm install
npm run dev
```

Abra:

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## 5) Como validar login + sessao

1. Abra o portal.
2. A tela de login deve aparecer.
3. Entre com um dos usuarios do Supabase Auth.
4. Se o usuario estiver ativo e vinculado em `public.usuarios`, o portal abre normalmente.
5. Clique em `Sair` para validar logout.

Erros comuns:

- `Usuario autenticado sem perfil em public.usuarios`: faltou `auth_user_id`.
- `Usuario inativo`: campo `status` diferente de `Ativo` em `public.usuarios`.
- `Falha ao validar perfil no banco`: `auth-rls.sql` nao rodado ou policy bloqueando acesso.

## 6) Como validar a Base de Clientes

1. Abra a tela **Base de Clientes**.
2. Confira o status no topo/menu lateral:
   - `Conectado ao Supabase (...)` quando a leitura funcionar.
   - `Falha no Supabase (usando base local)` quando cair para fallback.
3. Teste criar/editar/inativar cliente:
   - quando o registro for UUID, a alteracao tenta salvar no Supabase;
   - se falhar, o frontend mantem alteracao local para nao quebrar o uso.

## 7) Sincronizar os 96 clientes mockados para o banco (opcional)

Se `public.clientes` estiver vazio e voce quiser popular rapidamente:

```bash
npm run supabase:sync:clientes
```

Esse comando roda em **dry-run** (nao grava).  
Para gravar de fato:

```bash
npm run supabase:sync:clientes:apply
```

O script faz `upsert` por `cnpj` na tabela `public.clientes`.

## 8) Importacao Excel persistente (fase atual)

A importacao pelo botao do portal agora grava na tabela `public.clientes` usando `upsert` por CNPJ.

Regras aplicadas:

- valida colunas obrigatorias na aba `Base` (`CNPJ`, `Razao Social`, `Tipo de Cliente`, `Regime Tributario`, `Atividade/Atividades`);
- preserva CNPJ como texto formatado;
- atualiza cliente existente quando CNPJ ja existe;
- cria cliente quando CNPJ nao existe;
- nao remove clientes ausentes na planilha;
- converte datas para formato ISO (`yyyy-mm-dd`);
- converte valor monetario para numero;
- mostra pre-visualizacao antes de gravar;
- mostra resumo final: linhas lidas, criados, atualizados, ignorados e erros.
- registra historico persistente para clientes atualizados via importacao (`tipo_acao = importacao_excel`).

Como testar:

1. Abra o portal e clique em `Importar planilha`.
2. Selecione o arquivo Excel.
3. Revise a pre-visualizacao (linhas, criados, atualizados, ignorados, erros).
4. Clique em `Confirmar importacao`.
5. Aguarde o resumo final no toast.
4. Valide no Supabase:

```sql
select count(*) from public.clientes;
```

```sql
select cnpj, razao_social, atualizado_em
from public.clientes
order by atualizado_em desc
limit 20;
```

## 9) Historico persistente de alteracoes

A tabela `public.historico_alteracoes` registra:

- `cliente_id`
- `usuario_id`
- `usuario_email`
- `usuario_nome`
- `campo_alterado`
- `valor_anterior`
- `valor_novo`
- `tipo_acao`
- `origem`
- `data_alteracao`

Campos monitorados:

- `regime_tributario`
- `responsavel`
- `revisor`
- `competencia_em_dia`
- `ultima_competencia_entregue`
- `situacao`
- `dias_atraso`
- `distribuicao_lucros`
- `envio_reinf`
- `data_enviada_reinf`
- `valor_lucro_acumulado`
- `ecd`
- `ultima_ecd_entregue`
- `data_entrega_ecd`
- `data_envio_ecd`
- `responsavel_ecd`
- `ecf`
- `ultima_ecf_entregue`
- `pendencia_tecnica`
- `cliente_notificado`
- `proxima_acao`
- `status`

Como validar no Supabase:

```sql
select cliente_id, usuario_email, campo_alterado, valor_anterior, valor_novo, tipo_acao, origem, data_alteracao
from public.historico_alteracoes
order by data_alteracao desc
limit 50;
```

Limitacoes desta fase:

- sem remocao de anexos nesta fase;
- sem logs dedicados de importacao;
- sem controle avancado por perfil/campo.

## 10) Anexos persistentes (Storage privado)

Bucket utilizado:

- `documentos-clientes` (privado)

Regras de upload:

- tamanho maximo: `10MB`
- MIME permitido: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
- path padrao: `clientes/{cliente_id}/{tipo_anexo}/{timestamp}-{nome-normalizado}`

Fluxo:

1. Upload no Storage privado.
2. Gravacao do vinculo na tabela `public.anexos`.
3. Leitura de anexos por cliente/tipo.
4. Visualizacao/download por URL assinada (sem URL publica fixa).

Como validar no Supabase:

```sql
select id, cliente_id, tipo_anexo, nome_arquivo, caminho_arquivo, criado_em
from public.anexos
order by criado_em desc
limit 50;
```

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'storage_docs_clientes_%'
order by policyname;
```

## 11) Checklist operacional por perfil

Use este checklist antes de liberar mudancas no portal.

### Coordenador (`leticiacampos@f12contabilidade.com.br`)

1. Login e acesso:
   - entrar no portal;
   - abrir Dashboard, Base de Clientes, REINF/Lucros, ECD/ECF, Pendencias, Relatorios e Gestao de Usuarios.
2. Edicao de cliente:
   - alterar `situacao` e `responsavel` de um cliente;
   - salvar e confirmar no banco:

## 12) Camada persistente de status e pendencias das obrigacoes

O arquivo `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\obrigacoes-status.sql` cria:

- helpers SQL para leitura de campos `Sim / Nao`
- a view `public.vw_clientes_obrigacoes_status`

Essa view consolida, por cliente:

- status de REINF
- status de ECD
- status de ECF
- comprovantes pendentes
- responsavel pendente
- comunicacao pendente
- pendencia critica

Objetivo:

- reduzir regra operacional espalhada no frontend
- dar mais consistencia entre REINF, ECD/ECF e Pendencias
- preparar o portal para uma futura camada server-side mais forte

Como validar no Supabase:

```sql
select
  cliente_id,
  reinf_status_label,
  ecd_status_label,
  ecf_status_label,
  obrigacoes_status_label,
  comunicacao_pendente,
  pendencia_critica,
  pendencias_obrigacoes_total
from public.vw_clientes_obrigacoes_status
order by pendencias_obrigacoes_total desc, cliente_id
limit 30;
```

Se a view ainda nao estiver criada, o frontend continua funcionando com fallback para a logica local atual.

```sql
select cnpj, situacao, responsavel, atualizado_em
from public.clientes
order by atualizado_em desc
limit 10;
```

3. Historico persistente:
   - confirmar registro da alteracao:

```sql
select usuario_email, campo_alterado, valor_anterior, valor_novo, tipo_acao, origem, data_alteracao
from public.historico_alteracoes
order by data_alteracao desc
limit 20;
```

4. Importacao Excel:
   - importar uma planilha de teste;
   - validar resumo (criados/atualizados/ignorados/erros);
   - conferir registros recentes em `public.clientes`.
5. Anexos:
   - anexar arquivo REINF ou ECD;
   - visualizar por URL assinada;
   - substituir arquivo;
   - validar em `public.anexos`.
6. Logout:
   - clicar em `Sair` e confirmar retorno para tela de login.

### Setor Contabil (`contabil@f12contabilidade.com.br`)

1. Login e acesso:
   - entrar no portal;
   - confirmar acesso as telas operacionais (Dashboard, Base, Pendencias, REINF/Lucros, ECD/ECF, Relatorios).
2. Restricao de usuarios:
   - confirmar que **nao** acessa Gestao de Usuarios.
3. Edicao operacional:
   - alterar campos permitidos (ex.: `situacao`, `cliente_notificado`, `proxima_acao`);
   - salvar e validar no banco em `public.clientes`.
4. Anexos:
   - anexar e substituir comprovante (REINF/Lucros/ECD/ECF);
   - confirmar visualizacao.
5. Historico:
   - confirmar que `usuario_email = contabil@f12contabilidade.com.br` aparece em `public.historico_alteracoes`.
6. Logout:
   - clicar em `Sair`.

### Fluxo ponta a ponta minimo (aceitacao)

O fluxo abaixo deve funcionar sem erro para considerar a versao estavel:

1. login;
2. listar clientes;
3. editar cliente;
4. importar Excel;
5. anexar ou substituir comprovante;
6. validar historico;
7. logout.

Se qualquer item falhar, corrigir antes de novas features.

## Estrutura criada nesta fase

- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\src\lib\supabase.ts`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\src\services\clientes.service.ts`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\src\services\listagens.service.ts`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\schema.sql`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\seed.sql`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\auth-rls.sql`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\historico.sql`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\anexos.sql`
- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\storage.sql`

## Seguranca (proxima fase)

O proximo passo e evoluir o RLS para separar permissoes entre:

- Coordenador / Administrador
- Setor Contabil / Operacional

## Hardening atual de usuarios (aplicado)

Arquivo:

- `C:\Users\F12 CONTABILIDADE 13\Documents\New project\supabase\usuarios-hardening.sql`

Esse script reforca:

- sem permissao de `insert/delete` para `authenticated` em `public.usuarios`;
- leitura do proprio perfil para qualquer usuario autenticado;
- leitura/edicao global apenas para `leticiacampos@f12contabilidade.com.br`;
- ausencia de policy de `insert/delete` para manter bloqueio por RLS.
