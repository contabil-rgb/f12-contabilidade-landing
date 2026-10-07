# Navegação e estado por URL do Portal F12

## Objetivo

Permitir que cada página relevante do portal seja representada na URL para que:

- os botões Voltar e Avançar do navegador acompanhem as trocas de página;
- uma recarga mantenha a página atual;
- links internos possam abrir a página correta depois da autenticação;
- a navegação continue respeitando as permissões e o acesso aos clientes;
- o fluxo atual de recuperação de senha permaneça funcional.

Esta mudança não exige alterações no Supabase, migrations ou automações.

## Estratégia escolhida

Usar a History API do navegador (`pushState`, `replaceState` e `popstate`) e parâmetros de consulta na URL. A primeira implementação não adicionará uma biblioteca de roteamento.

Motivos:

- mantém o caminho `/` já atendido pelo ambiente local e pela hospedagem atual;
- evita depender de regras de reescrita para caminhos como `/clientes`;
- reduz a quantidade de mudanças no aplicativo atual;
- permite preservar parâmetros já usados pela recuperação de senha.

## Parâmetros reservados para navegação

| Parâmetro | Finalidade | Valores iniciais permitidos |
| --- | --- | --- |
| `pagina` | Página principal | `dashboard`, `clientes`, `cliente`, `reinf`, `ecd`, `checklist`, `relatorios`, `usuarios`, `historico` |
| `aba` | Subpágina do Checklist | `checklist`, `catalogo`, `historico`, `automacao` |
| `cliente` | Identificador do cliente na página de detalhe | UUID/identificador já usado pelo portal |
| `ano` | Ano da competência do Checklist | ano com quatro dígitos dentro dos limites aceitos pela tela |
| `mes` | Mês da competência do Checklist | inteiro de `1` a `12` |
| `pagina_lista` | Página da listagem paginada | inteiro maior ou igual a `1` |
| `por_pagina` | Quantidade de registros por página | `10`, `25` ou `50` |

Os parâmetros `ano`, `mes`, `pagina_lista` e `por_pagina` entram depois que a navegação principal e as subpáginas estiverem estáveis.

Parâmetros que não pertencem à navegação, como `type`, `token_hash` e `code`, não serão apagados pelo controlador de navegação. Durante o fluxo de recuperação de senha, esse fluxo terá prioridade sobre a página do portal.

## URLs canônicas

| Destino | URL canônica |
| --- | --- |
| Dashboard | `/?pagina=dashboard` |
| Base de Clientes | `/?pagina=clientes` |
| Detalhe do cliente | `/?pagina=cliente&cliente=<id>` |
| Distribuição de Lucro | `/?pagina=reinf` |
| ECD / ECF | `/?pagina=ecd` |
| Checklist de documentos | `/?pagina=checklist&aba=checklist` |
| Cadastro de documentos | `/?pagina=checklist&aba=catalogo` |
| Histórico de envios do Checklist | `/?pagina=checklist&aba=historico` |
| Automação do Checklist | `/?pagina=checklist&aba=automacao` |
| Relatórios | `/?pagina=relatorios` |
| Gestão de Usuários | `/?pagina=usuarios` |
| Histórico geral | `/?pagina=historico` |

## Correspondência com o estado interno atual

| URL | Estado interno atual |
| --- | --- |
| `pagina=cliente` | `page = detalhe` |
| `aba=catalogo` | `viewMode = catalog` |
| `aba=historico` | `viewMode = history` |
| `aba=automacao` | `viewMode = automation` |
| `aba=checklist` | `viewMode = checklist` |

A tradução ficará centralizada. Componentes não deverão interpretar livremente valores da URL.

## Regras de resolução inicial

1. Se a URL estiver em um fluxo de recuperação de senha, abrir esse fluxo antes de resolver a navegação do portal.
2. Sem `pagina`, usar `dashboard` e normalizar a URL com `replaceState` depois que a aplicação estiver pronta.
3. Para uma `pagina` desconhecida, usar `dashboard` e substituir a URL inválida sem criar uma nova entrada no histórico.
4. Para `pagina=checklist` sem uma `aba` válida, usar `aba=checklist`.
5. Para `pagina=cliente`, exigir o parâmetro `cliente`.
6. O detalhe do cliente só será aberto depois que os dados necessários estiverem disponíveis e o usuário puder visualizar esse cliente.
7. Cliente inexistente, removido ou sem acesso leva à Base de Clientes com uma mensagem clara, sem revelar dados do cliente solicitado.

## Autenticação e permissões

- A URL não concede acesso. Todas as verificações atuais continuam sendo aplicadas.
- A navegação solicitada será resolvida depois da restauração da sessão.
- `usuarios` exige `USERS_MANAGE`.
- `historico` exige `HISTORY_VIEW`.
- `relatorios` exige `REPORTS_VIEW`.
- `dashboard` continua sujeito a `DASHBOARDS_VIEW`.
- O detalhe do cliente exige que `canViewClient` autorize o usuário atual.
- Quando uma página protegida for solicitada sem permissão, o portal abrirá `clientes`, que é a página autenticada segura de retorno, e exibirá uma mensagem de acesso negado.
- Ao sair da conta, o estado interno volta ao padrão. Nenhum identificador de cliente será armazenado em `sessionStorage` ou `localStorage` pela navegação.

## Regras do histórico do navegador

### Criar uma entrada com `pushState`

- clique em uma página diferente no menu;
- atalho do Dashboard que muda de página;
- abertura do detalhe de um cliente;
- troca entre as quatro subpáginas do Checklist.

### Atualizar a entrada atual com `replaceState`

- normalização inicial de URL ausente ou inválida;
- correção de parâmetros incompatíveis;
- mudança futura de filtros, competência ou paginação que não deva criar uma entrada para cada alteração;
- tentativa de navegar novamente para a mesma página e o mesmo estado.

### Tratar `popstate`

- Voltar e Avançar atualizam o estado React sem executar um novo `pushState`;
- modais abertos e formulários não salvos são fechados antes da troca de página;
- a página restaurada executa somente as consultas específicas que já executaria ao ser aberta normalmente;
- o carregamento global do Supabase não será reiniciado por uma simples troca de histórico.

## Botão Voltar do detalhe do cliente

- Se o detalhe foi aberto a partir de uma página do portal presente no histórico, o botão retorna a essa entrada.
- Se o detalhe foi aberto diretamente por uma URL, o botão abre a Base de Clientes.
- Um marcador interno em `history.state` distinguirá uma entrada criada pelo portal de uma visita direta.

## Estado que será persistido

### Primeira entrega

- página principal;
- subpágina do Checklist;
- cliente aberto.

### Depois da navegação principal estar validada

- ano e mês do Checklist;
- página e tamanho da página no Histórico de envios;
- filtros estáveis que agreguem valor após a recarga.

### Estado que não será colocado na URL

- senhas, tokens ou dados pessoais;
- conteúdo de formulários ainda não salvo;
- modais de confirmação;
- seleção temporária de linhas;
- mensagens e avisos temporários;
- texto de e-mail ou conteúdo de testes da automação.

## Comportamento do Supabase

- Uma navegação interna não recarrega a página do navegador e não reinicia o bootstrap global do Supabase.
- Uma recarga completa ainda restaura a sessão e sincroniza os dados como ocorre hoje.
- Depois dessa restauração, a página registrada na URL será exibida em vez de forçar o Dashboard.
- Páginas como Checklist e Automação continuarão executando suas consultas próprias quando forem montadas.
- Nenhuma tabela, função, policy ou migration será modificada para implementar a navegação.

## Critérios de aceite

1. Trocar de página atualiza a URL sem recarregar o navegador.
2. Voltar e Avançar percorrem páginas e subpáginas visitadas na ordem correta.
3. Recarregar mantém a página, a subpágina do Checklist ou o cliente aberto.
4. Uma URL de cliente inválida ou não autorizada não expõe dados e retorna à Base de Clientes.
5. Login, logout, primeira senha, senha obrigatória e recuperação de senha continuam funcionando.
6. As permissões atuais continuam sendo aplicadas.
7. O bootstrap global do Supabase não é repetido em cada troca de página.
8. A automação do Checklist continua funcionando sem mudanças.
9. O build e todos os testes existentes permanecem aprovados.
10. Testes específicos cobrem leitura da URL, serialização, URL inválida e navegação por `popstate`.

## Fora do escopo desta implementação

- alterar o banco de dados;
- criar migrations;
- alterar a lógica de envio ou processamento das automações;
- manter formulários não salvos após uma recarga;
- transformar todas as tabelas do portal em paginação de servidor;
- publicar a alteração antes da validação local completa.
