# Portal de Gestao Contabil F12

Portal interno em React + Vite para operacao da carteira contabil, com Supabase como camada principal de banco, autenticacao, historico e anexos.

## Estado atual

O projeto ja esta alem da fase de prototipo.

Hoje o portal possui:

- dashboard operacional;
- Base de Clientes;
- telas de Pendencias, REINF, ECD / ECF e Relatorios;
- autenticacao com Supabase Auth;
- usuarios persistidos em `public.usuarios`;
- clientes persistidos em `public.clientes`;
- listagens persistidas em `public.listagens`;
- historico persistido em `public.historico_alteracoes`;
- anexos persistidos em `public.anexos` + Storage privado;
- views operacionais para obrigacoes, risco e acompanhamento.

Observacoes importantes:

- follow-ups foram removidos do projeto;
- `proxima_acao` e `prazo_proxima_acao` deixaram de fazer parte do fluxo atual;
- o snapshot local da base ainda existe apenas como apoio administrativo para reaplicacao controlada de clientes.

## Estrutura principal

- [src/App.jsx](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/App.jsx)
- [src/lib/supabase.ts](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/lib/supabase.ts)
- [src/services/clientes.service.ts](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/services/clientes.service.ts)
- [src/services/listagens.service.ts](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/services/listagens.service.ts)
- [src/services/importacao.service.js](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/services/importacao.service.js)
- [supabase/README.md](C:/Users/F12 CONTABILIDADE 13/Documents/New project/supabase/README.md)
- [OPERACAO-REAL.md](C:/Users/F12 CONTABILIDADE 13/Documents/New project/OPERACAO-REAL.md)

## Variaveis de ambiente

Crie ou ajuste [\.env.local](C:/Users/F12 CONTABILIDADE 13/Documents/New project/.env.local):

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

O frontend valida essas variaveis em [src/lib/supabase.ts](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/lib/supabase.ts).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra:

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Scripts uteis

```bash
npm run build
```

Gera o build de producao do frontend.

```bash
npm run supabase:sync:clientes
```

Dry-run da sincronizacao do snapshot local de clientes.

```bash
npm run supabase:sync:clientes:apply
```

Aplica a sincronizacao do snapshot local de clientes no Supabase por `upsert` de CNPJ.

## Banco de dados

Toda a documentacao SQL ativa esta em:

- [supabase/README.md](C:/Users/F12 CONTABILIDADE 13/Documents/New project/supabase/README.md)

Para uma validacao rapida da estrutura remota, use:

- [supabase/health-check.sql](C:/Users/F12 CONTABILIDADE 13/Documents/New project/supabase/health-check.sql)

## Importacao Excel

A importacao do portal:

- le a aba `Base`;
- identifica colunas obrigatorias;
- faz `upsert` em `public.clientes` por CNPJ;
- nao remove clientes ausentes da planilha;
- gera resumo de criados, atualizados, ignorados e erros.

Fluxo principal:

- [src/lib/excel.js](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/lib/excel.js)
- [src/services/importacao.service.js](C:/Users/F12 CONTABILIDADE 13/Documents/New project/src/services/importacao.service.js)

## Reaplicacao do snapshot local

O portal possui um fluxo administrativo para reaplicar os clientes do snapshot local no Supabase.

Esse fluxo:

- atualiza ou recria os registros do snapshot;
- nao remove clientes extras existentes no banco;
- nao recompõe anexos;
- nao recompõe historico;
- nao deve ser tratado como reset completo do portal.

## Uso real

Para preparar o portal para uso real no trabalho do dia a dia, siga:

- [OPERACAO-REAL.md](C:/Users/F12 CONTABILIDADE 13/Documents/New project/OPERACAO-REAL.md)

Esse guia concentra:

- checklist de banco;
- checklist de usuarios;
- smoke test operacional;
- criterios de liberacao controlada.
