# Ápice Almoxarifado

Aplicativo operacional para registrar saídas de materiais no balcão com assinatura.

## Regras principais

- A obra é obtida automaticamente do vínculo ativo do funcionário autenticado.
- O acesso é bloqueado quando não existe vínculo ou quando existem vários vínculos ativos.
- Somente funcionários ativos da mesma obra podem retirar materiais.
- A entrega e todas as baixas são registradas em uma única transação no banco.
- A assinatura fica vinculada ao funcionário, operador, obra, frente e itens entregues.

## Desenvolvimento

```bash
npm run dev
npm run build
```

Antes de usar, aplique a migração `20260824000002_app_almoxarifado_entregas.sql` no Supabase.
