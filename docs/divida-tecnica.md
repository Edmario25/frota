# Dívida técnica e prioridades

Atualizado em 22 de agosto de 2026.

## Estado verificado

- build de produção aprovado;
- verificação TypeScript aprovada;
- lint sem erros bloqueantes;
- quatro testes de autenticação aprovados;
- páginas carregadas sob demanda;
- pacote principal reduzido de aproximadamente 2,02 MB para 181,69 KB.

## Prioridade alta

### Testes de autorização e RLS

Criar testes por perfil e por obra para confirmar que a interface e, principalmente, o banco rejeitam operações indevidas. Cobrir tabelas de funcionários, veículos, ponto, estoque, SMS e documentos.

### Fluxos críticos

Adicionar testes para transferência/devolução de veículos, ciclos de quilometragem, sincronização Traccar, movimentação de estoque, entrega de EPI e banco de horas.

### Tipagem do Supabase

O projeto ainda possui centenas de usos de `any`, muitos associados a tabelas recentes. Regenerar `src/integrations/supabase/types.ts` e remover coerções por módulo, começando por autenticação, permissões e operações financeiras.

### Hooks com dependências incompletas

Revisar individualmente os avisos de `react-hooks/exhaustive-deps`. Não adicionar dependências mecanicamente: estabilizar callbacks quando necessário e testar cada fluxo contra requisições repetidas e dados obsoletos.

## Prioridade média

### Componentes muito grandes

Separar páginas como Almoxarifado, Relatórios, Campo, Cronograma e SMS EPI em componentes menores, hooks de domínio e serviços. Fazer a divisão gradualmente, acompanhada de testes.

### PWA e cache

O service worker inclui todos os pacotes de páginas no precache. Avaliar cache sob demanda para reduzir dados baixados na primeira visita, preservando a experiência offline necessária em campo.

### Edge Function de criação de usuários

Tornar a criação do usuário e a atribuição do cargo uma operação consistente. Se a atribuição falhar, remover o usuário criado ou retornar uma falha recuperável, sem comunicar sucesso parcial.

### Aplicativos Capacitor

Alinhar versões do Capacitor entre a raiz e os três aplicativos, automatizar builds assinados e publicar APK/AAB como artefato de release em vez de versionar binários de depuração.

## Critérios para novas entregas

Uma nova funcionalidade deve incluir:

1. migration aditiva quando alterar o banco;
2. política RLS revisada;
3. tipos do Supabase atualizados;
4. teste do caminho principal e da negação de acesso;
5. `npm run check` aprovado;
6. atualização da documentação afetada.
