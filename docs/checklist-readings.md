# Leituras manuais em checklists

## Configuracao

Cada `ChecklistTemplate` possui um `readingMode`:

- `NONE`: nao exige leitura;
- `HOURMETER`: exige horimetro;
- `MILEAGE`: exige quilometragem;
- `BOTH`: exige as duas leituras.

O modo e copiado para `ChecklistExecution.readingMode` no momento da execucao. Essa copia preserva o contexto historico quando o modelo for alterado posteriormente.

## Formato e unidades

- Horimetro: numero nao negativo, no maximo duas casas decimais, unidade `h`.
- Quilometragem: numero nao negativo, no maximo duas casas decimais, unidade `km`.
- O backend e a validacao definitiva.
- Valores iguais a ultima leitura conhecida sao permitidos.
- Valores inferiores sao rejeitados.

As colunas historicas existentes `hourmeterValue` e `mileageValue` continuam sendo a fonte do valor. Tipo e unidade sao invariantes do dominio e tambem sao expostos pela API no campo aditivo `readings`.

## Consistencia

A criacao da execucao bloqueia somente a linha do equipamento na transacao. A leitura e comparada com o maior valor entre o cadastro atual do equipamento e a ultima execucao aplicavel. Quando valida, a mesma transacao:

1. grava a leitura na execucao;
2. grava o snapshot do modo;
3. atualiza o medidor atual do equipamento;
4. grava os itens e eventuais manutencoes.

Nao existe override para reducao. Troca, reinicializacao ou correcao de medidor deve ser implementada em fluxo auditado separado.

## Compatibilidade

O valor padrao de modelos e execucoes antigas e `NONE`. Os campos de leitura continuam anulaveis e os contratos anteriores `hourmeterValue` e `mileageValue` nao foram removidos.

## Implantacao e rollback

A migration `20260728160000_add_checklist_reading_mode` e aditiva. O entrypoint usa `prisma migrate deploy`; `prisma db push` nao deve ser usado em producao.

Antes da implantacao, deve-se criar backup consistente e testar restauracao. Como o banco existente antecede o Prisma Migrate, a baseline `20260728150000_baseline` deve ser revisada contra o schema real e marcada como aplicada com `prisma migrate resolve --applied 20260728150000_baseline`. Somente depois `prisma migrate deploy` podera aplicar `20260728160000_add_checklist_reading_mode`.

O rollback seguro inicial e reverter a aplicacao e manter as novas colunas; remover colunas ou o enum apagaria contexto historico e exige autorizacao separada.
