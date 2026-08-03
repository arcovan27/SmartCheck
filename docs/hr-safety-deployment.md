# Implantacao segura dos ajustes de Recursos Humanos

Este procedimento cobre exclusao logica de setores, Indicadores de ocorrencias, historico de inativacao de funcionarios e as ocorrencias de advertencia, suspensao e acidente de trabalho.

## Bloqueios obrigatorios

- Nao usar `prisma db push`.
- Nao iniciar o container com `RUN_MIGRATIONS_ON_START=true` antes da homologacao e do backup.
- Nao marcar a baseline como aplicada sem comparar o schema real do destino.
- Nao executar seed em producao.
- Nao remover colunas, tabelas ou valores de enum durante o rollback operacional.

## 1. Preflight somente leitura

1. Confirmar o destino de `DATABASE_URL` sem imprimir credenciais.
2. Registrar versao do PostgreSQL e tamanho do banco.
3. Consultar `_prisma_migrations` e salvar a lista de migracoes aplicadas.
4. Gerar `prisma migrate status` usando a mesma versao de Prisma da aplicacao.
5. Comparar a baseline `20260728150000_baseline` com o schema existente.
6. Confirmar espaco para backup, janela de manutencao e responsavel pelo aceite.

## 2. Backup e restauracao

Criar backup consistente com a ferramenta homologada para o ambiente, registrar checksum e testar a restauracao em banco isolado. O teste de restauracao e requisito de continuidade; a existencia isolada do arquivo de backup nao e suficiente.

## 3. Homologacao

Em um clone anonimizado ou banco vazio isolado:

1. Reconciliar a baseline conforme o estado real.
2. Executar `prisma migrate deploy`.
3. Validar chaves estrangeiras, indices e valores dos enums.
4. Executar os testes automatizados.
5. Validar exclusao de setor, transferencia, inativacao, reativacao e indicadores com duas empresas distintas.
6. Medir as consultas do Pulso e dos Indicadores de ocorrencias com volume representativo.
7. Antes de `20260730230000_add_disciplinary_and_work_accident_occurrences`, executar a consulta de preflight de duplicidade em `DailyAttendance`; a migracao aborta se houver mais de um apontamento ativo para a mesma pessoa/data.
8. Validar em homologacao que `ADVERT`, `SUSP` e `ACID_TRAB` existem para todas as empresas e que motivos disciplinares controlados foram cadastrados.

## 4. Producao

Somente apos aceite da homologacao:

1. Colocar a aplicacao em janela controlada.
2. Criar e validar novo ponto de recuperacao.
3. Executar as migracoes por uma tarefa unica e observavel, sem seed.
4. Manter `RUN_MIGRATIONS_ON_START=false` nos containers normais.
5. Publicar a API e depois o frontend.
6. Executar smoke tests de permissao, isolamento por empresa e leitura historica.
7. Monitorar erros, latencia e bloqueios de banco.

## 5. Rollback

O rollback preferencial e da aplicacao. As estruturas de banco sao aditivas e podem permanecer sem uso.

- Setor: restaurar `isActive`, `deletedAt`, `deletedById` e `deletionReason` somente apos revisar a auditoria. Transferencias devem ser revertidas individualmente a partir dos snapshots e do log.
- Funcionario: usar o fluxo de reativacao. Escalas canceladas nao sao restauradas automaticamente.
- Aplicacao: retornar a imagem anterior com migracao automatica desabilitada.
- Ocorrencias novas: retornar primeiro a aplicacao anterior; manter colunas, relacionamentos, permissoes e o indice parcial sem uso. Nao apagar ocorrencias nem apontamentos materializados. Cancelamentos devem usar o fluxo logico auditado.
- Regra de documento: se for necessario restaurar a exigencia anterior de `ACID_TRAB`, atualizar `FrequencyType.requiresDocument` para `true` somente apos confirmar que isso nao bloqueara registros ja pendentes.
- Schema: remover estruturas somente em manutencao separada e depois de confirmar que nenhuma versao da aplicacao as utiliza. Valores adicionados a enums PostgreSQL nao devem ser removidos em rollback emergencial.

## Evidencias a arquivar

- Identificador e checksum do backup.
- Resultado do teste de restauracao.
- Saida de `prisma migrate status` antes e depois.
- Versao das imagens implantadas.
- Resultado dos smoke tests.
- Horario, executor e aprovador da mudanca.
