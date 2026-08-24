# Ápice Almoxarifado

Aplicativo operacional para registrar saídas de materiais no balcão com assinatura e controlar a devolução de ferramentas.

## Regras principais

- A obra é obtida automaticamente do vínculo ativo do funcionário autenticado.
- O acesso é bloqueado quando não existe vínculo ou quando existem vários vínculos ativos.
- Somente funcionários ativos da mesma obra podem retirar materiais.
- A entrega e todas as baixas são registradas em uma única transação no banco.
- A assinatura fica vinculada ao funcionário, operador, obra, frente e itens entregues.
- Materiais de consumo são baixados definitivamente; ferramentas retornáveis permanecem sob responsabilidade do funcionário.
- A devolução libera a responsabilidade e registra a condição do item como bom, avariado ou inutilizado.

## Desenvolvimento

```bash
npm run dev
npm run build
```

Antes de usar, aplique em ordem as migrations:

- `20260824000002_app_almoxarifado_entregas.sql`
- `20260824000003_employee_app_access_controls.sql`
- `20260824000004_almoxarifado_devolucoes.sql`
