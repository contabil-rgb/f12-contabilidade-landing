# Operacao Real

Guia pratico para colocar o portal em uso real com mais seguranca.

## 1. Antes de liberar

Confirme:

- frontend abrindo sem erro;
- `npm run build` passando;
- variaveis de ambiente do Supabase preenchidas;
- SQLs principais aplicados no projeto Supabase correto;
- usuarios reais ja criados e vinculados.

## 2. Health check do Supabase

No SQL Editor, rode:

- [supabase/health-check.sql](C:/Users/F12 CONTABILIDADE 13/Documents/New project/supabase/health-check.sql)

Verifique:

- existencia de `clientes`, `listagens`, `usuarios`, `historico_alteracoes`, `anexos`;
- contagem basica das tabelas;
- RLS ativo;
- policies criadas;
- bucket `documentos-clientes`;
- helper `public.is_portal_coordenador`.

## 3. Smoke test minimo

Antes de abrir para a equipe, teste:

1. login;
2. logout;
3. Dashboard carregando do Supabase;
4. Base de Clientes abrindo e filtrando;
5. editar um cliente e salvar;
6. abrir detalhe de cliente;
7. upload de anexo;
8. historico registrando alteracao;
9. Gestao de Usuarios abrindo para coordenador;
10. usuario operacional sem acesso indevido a acoes administrativas.

## 4. Perfis para validar

### Coordenador

Confirmar:

- acesso total ao portal;
- edicao de clientes;
- acesso a Gestao de Usuarios;
- alteracao de status de usuario;
- anexos;
- historico.

### Usuario operacional

Confirmar:

- acesso apenas ao que o perfil permite;
- sem acesso indevido a Gestao de Usuarios;
- operacao normal em clientes e anexos dentro do escopo permitido.

## 5. Cuidados importantes

### Reaplicar snapshot local

O botao administrativo de reaplicacao:

- exige `VITE_ENABLE_LOCAL_SNAPSHOT_TOOLS=true` no `.env.local`;
- exige ambiente local (`localhost`, `127.0.0.1` ou `::1`);
- nao faz reset completo do portal;
- nao remove clientes extras do banco;
- nao remove nem recompõe anexos;
- nao recompõe historico;
- existe apenas como ferramenta administrativa isolada;
- deve ser usado com consciencia administrativa.

### Importacao Excel

A importacao:

- faz `upsert` por CNPJ;
- cria ou atualiza clientes;
- nao remove clientes ausentes da planilha.

## 6. Liberacao recomendada

Para uso real, recomendo esta sequencia:

1. liberar para poucas pessoas primeiro;
2. acompanhar uso por alguns dias;
3. observar erros de permissao, anexo e importacao;
4. so depois ampliar para o restante da equipe.

## 7. O que ainda merece atencao

Hoje o projeto ja esta utilizavel, mas ainda merece vigilancia em:

- testes automatizados ainda inexistentes;
- fluxos administrativos sensiveis;
- validacao prolongada com usuarios reais;
- disciplina de checkpoint no git antes de mudancas maiores.

## 8. Rotina saudavel de manutencao

- usar branch para mudancas relevantes;
- validar em ambiente local antes de merge;
- executar `npm run build` antes de fechar rodada;
- manter SQLs versionados e aplicados com cuidado;
- registrar qualquer ajuste operacional sensivel.

## 9. Gate final de liberacao

Antes de considerar o portal pronto para uso real, fechar este gate:

- `npm run build` executado sem erro;
- `supabase/health-check.sql` conferido no projeto correto;
- login e logout validados;
- sessao restaurando corretamente apos reload;
- coordenador validado nas areas administrativas;
- usuario operacional validado sem acesso indevido;
- edicao de cliente validada;
- anexos validados;
- historico validado;
- modo protegido validado:
  - leitura liberada com ultima sincronizacao;
  - gravacoes bloqueadas durante indisponibilidade;
  - reconexao limpando o estado de contingencia;
- `VITE_ENABLE_LOCAL_SNAPSHOT_TOOLS=false` no ambiente normal de operacao.

Se algum item acima falhar, a liberacao deve ser adiada ate o ajuste.

## 10. Checklist de publicacao

Ao publicar em dominio ou hospedagem real, confirmar:

- variaveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` configuradas no host;
- `VITE_ENABLE_LOCAL_SNAPSHOT_TOOLS=false` no ambiente publicado;
- URL final do portal configurada corretamente no Supabase Auth;
- URL de redirecionamento de recuperacao de senha configurada no Supabase Auth;
- build publicado sem depender de `localhost`;
- login funcionando no dominio final;
- recuperacao de senha testada no dominio final;
- leitura da base carregando do Supabase no dominio final;
- anexos com upload, visualizacao e download testados no dominio final.

## 11. Parecer atual

Estado atual do projeto, com base nas auditorias ja feitas:

- pronto para uso controlado com equipe pequena;
- pronto para homologacao em dominio;
- ainda merece acompanhamento nas primeiras semanas de uso real;
- ainda nao possui testes automatizados.

## 12. Publicacao atual

Configuracao operacional ja validada:

- dominio oficial publicado em `https://f12contabilidade.com.br`;
- Cloudflare Pages ativa com fallback tecnico em `https://f12-contabilidade-landing.pages.dev`;
- `Site URL` do Supabase Auth ajustado para `https://f12contabilidade.com.br`;
- `Redirect URLs` validadas para:
  - `https://f12contabilidade.com.br/**`
  - `https://f12-contabilidade-landing.pages.dev/**`
  - `http://127.0.0.1:5173/**`
- login validado com os perfis Coordenador e Setor Contabil no dominio oficial.

Se uma nova publicacao for feita, lembrar:

- mudar no codigo local nao atualiza o site publicado sozinho;
- a nova versao so chega ao dominio depois de commit, push e novo deploy no host;
- qualquer ajuste visual critico deve ser validado no dominio oficial e nao apenas no ambiente local.
