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

