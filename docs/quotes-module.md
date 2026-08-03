# Modulo Orçamentos - diagnostico e ativacao

## Diagnostico da estrutura anterior

- Aplicacao web: React 19, React Router, TanStack Query, Vite e Tailwind.
- API: Fastify 5, Zod, Prisma e PostgreSQL.
- Empresas e unidades: modelos `Company` e `Unit`, com escopo por `UserCompanyAccess` e `UserUnitAccess`.
- Usuarios e responsaveis: modelo `User`, opcionalmente relacionado a `Employee`.
- Permissoes: enum `HrPermission`, tabela `RolePermission`, verificacao no backend e rota protegida no frontend.
- Auditoria: modelo generico `AuditLog`, sanitizacao de campos sensiveis e exclusao logica nos dominios que exigem preservacao.
- Clientes: nao existia modelo ou rota.
- Produtos/servicos: nao existia catalogo comercial; `Epi` nao representa produto de venda e nao foi reaproveitado indevidamente.
- Numeracao sequencial comercial: nao existia mecanismo reutilizavel.
- PDF: nao existia biblioteca ou gerador; apenas impressao do navegador em uma tela de escalas.
- Identidade visual: nao havia logo Arcovan no repositorio. O arquivo oficial fornecido foi localizado fora do projeto e copiado, sem transformacao, para `apps/api/assets/brand/arcovan-logo.png`.

## Modelo proposto

- `Customer`: cliente por empresa, com documento e dados usados no Espelho do Pedido.
- `CatalogItem`: produto ou servico por empresa, com codigo, unidade e preco decimal.
- `QuoteSequence`: contador atomico por empresa e ano.
- `Quote`: cabecalho, situacao, totais decimais, responsaveis, idempotencia e exclusao logica.
- `QuoteItem`: fotografia editavel dos itens no rascunho, com quantidade e valores decimais.
- `QuoteVersion`: snapshot JSON imutavel criado na emissao.
- `QuoteHistory`: trilha funcional de criacao, alteracao, emissao, decisao, cancelamento e geracao do documento.
- `AuditLog`: continua recebendo as mesmas acoes para a auditoria transversal da aplicacao.

A migration em `20260803180000_add_quotes` e apenas uma proposta e nao foi executada. Ela e aditiva, inclui checks financeiros, chaves estrangeiras e indices de concorrencia. O rollback remove as tabelas novas. Os valores `QUOTE_*` adicionados ao enum PostgreSQL permanecem inertes em um rollback porque a remocao segura de valores de enum exige recriacao do tipo.

## Permissoes

- `QUOTE_VIEW`
- `QUOTE_CREATE`
- `QUOTE_EDIT`
- `QUOTE_ISSUE`
- `QUOTE_DECIDE`
- `QUOTE_CANCEL`
- `QUOTE_DOCUMENT`
- `QUOTE_VALUE_VIEW`

Administradores recebem todas pelo fallback ja existente. Outros papeis devem receber grants explicitos apos homologacao, seguindo o principio do menor privilegio.

## Fluxo

1. Usuario autorizado cria um rascunho. O backend reserva `ORC-AAAA-000000` em transacao serializavel e aceita uma chave de idempotencia.
2. O usuario seleciona empresa, unidade, cliente e responsavel, informa condicoes e adiciona itens do catalogo ou itens livres.
3. O backend valida referencias no mesmo tenant e recalcula item, subtotal, desconto, acrescimo e total com `Prisma.Decimal`.
4. Rascunhos podem ser editados ou excluidos logicamente.
5. A emissao exige cliente e item, recalcula novamente e cria `QuoteVersion` com empresa, unidade, cliente, itens, precos e condicoes.
6. Orcamentos emitidos podem ser aprovados, rejeitados ou cancelados conforme permissao. Alteracao comercial posterior e feita por duplicacao, preservando o original.
7. O Espelho do Pedido usa sempre o snapshot da emissao e o unico asset oficial local. Visualizacao, download e impressao usam o mesmo PDF autenticado.
8. Cada acao grava `QuoteHistory` e `AuditLog` com usuario e data/hora.

## Ativacao proposta

1. Fazer backup e validar a versao do PostgreSQL em homologacao.
2. Revisar a migration e o rollback com a equipe responsavel pelo banco.
3. Aplicar a migration somente em homologacao.
4. Popular ou integrar os clientes e produtos existentes, caso estejam em outro sistema. O cadastro minimo de cliente ja esta disponivel no fluxo.
5. Conceder permissoes por papel; manter apenas administradores no primeiro acesso.
6. Publicar API e web em homologacao e executar testes de isolamento com pelo menos duas empresas e duas unidades.
7. Validar PDF em Chrome/Edge, download e impressoras colorida e monocromatica.
8. Agendar janela de producao, aplicar migration, publicar aplicacao e acompanhar logs/metricas.

## Rollback proposto

1. Bloquear temporariamente novas operacoes no modulo.
2. Reverter web e API para a imagem anterior.
3. Se nenhum dado precisar ser preservado, executar o `rollback.sql` autorizado.
4. Se houver dados, manter as tabelas novas inertes e remover apenas os grants `QUOTE_*`; essa e a opcao mais segura.
5. Restaurar backup somente em caso de falha de integridade confirmada.

## Riscos e pendencias

- A migration precisa de homologacao real; nao foi executada neste trabalho.
- O sistema anterior nao possuia base comercial. Clientes podem ser cadastrados no modulo, mas uma integracao/importacao do cadastro oficial deve ser definida antes da producao para evitar duplicidade organizacional.
- Produtos e servicos podem ser usados como itens livres; a governanca e carga inicial do novo `CatalogItem` ainda precisa ser definida.
- Nao ha papel comercial no enum `UserRole`; os grants devem ser associados aos papeis atuais ou um papel novo deve ser projetado separadamente.
- O repositorio nao possui lint configurado; os scripts atuais apenas informam isso.
- Testes com banco PostgreSQL real, duas empresas e concorrencia de conexoes dependem da autorizacao para aplicar a migration em um ambiente de homologacao.
