# Base operacional extraída dos arquivos enviados

Este documento resume a lógica dos formulários originais usados como base no SmartCheck.

## Controle de EPI (`EPI.pdf`)
- Campos principais: `Empresa`, `Departamento/Seção`, `Nome`, `Admissão`, `Setor`, `Mês referência`, `Função`, `Demissão`.
- Termo de responsabilidade de uso e conservação do EPI.
- Grade de entregas com colunas: `Data Entrega`, `Quantidade`, `C.A.`, `Descrição`, `Assinatura Funcionário`, `Entregue por`.
- No sistema digital:
  - Registro de entrega com funcionário, EPI, quantidade, CA, data e responsável.
  - Histórico por funcionário e relatório.

## Checklists de máquinas/veículos

Padrão comum dos formulários:
- Inspeção por dia do mês (1..31) ou semanal (ex.: Seg..Sex).
- Legenda operacional:
  - `OK` = funcionamento normal/bom estado
  - `X` = mau funcionamento ou dano
  - `I` = equipamento parado/sem uso
  - `N/A` = item não avaliável
- Regra crítica: ao marcar problema (`X`), descrição de defeito é obrigatória.
- Campos operacionais: operador, mês/ano, área de observações e visto de encarregado.

### Modelos identificados
- `Checklist Diário de Empilhadeira` (semanal no formulário) com itens de segurança, iluminação, comando, torre, GLP e EPIs.
- `Checklist Pá Carregadeira` com itens de motor, sistema elétrico, hidráulico, pneus e extintor.
- `Checklist Diário Misturador - Massa Tubos` com itens de painel, emergência, hidráulica, comportas, esteiras e segurança da plataforma.
- `Checklist Diário Prensa Tubos Manual (01)`.
- `Checklist Diário Prensa Tubos Manual (02)`.
- `Checklist Caminhão Munck` (arquivo XLS), dividido em bloco `GUINDASTE` e bloco `CAMINHÃO`.

## Fluxo de manutenção
- Defeito identificado em checklist gera ocorrência de manutenção corretiva.
- No SmartCheck:
  - Problema exige descrição e foto (obrigatório).
  - Ocorrência corretiva é aberta automaticamente.

## Preventiva
- O sistema adiciona regras automáticas por:
  - dias,
  - KM,
  - horímetro.
- Estados de alerta: `OK`, `NEAR`, `DUE`.
