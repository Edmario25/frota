# Auditoria do módulo de RH

Data da análise: 22/08/2026

## Resumo executivo

O projeto possui uma base funcional relevante para gestão de pessoas em obras: cadastro de funcionários, cargos, departamentos, vínculos, escalas, ponto, documentos, férias/ausências, banco de horas e visão de custos. O conjunto é adequado como **controle operacional**, mas ainda precisa de ajustes antes de ser apresentado como um RH profissional ou como folha de pagamento oficial.

Avaliação atual:

| Área | Situação |
| --- | --- |
| Cadastro e estrutura organizacional | boa base, requer validações e histórico |
| Permissões e privacidade | isolamento por obra aplicado, segregação de dados insuficiente |
| Admissão e desligamento | parcial |
| Jornada, ponto e escalas | funcional, requer regras e fechamento |
| Férias, ausências e documentos | cadastro básico, sem workflow completo |
| Banco de horas | funcional como controle simples, cálculo precisa ser corrigido |
| Folha/custo de pessoal | estimativa gerencial, não é folha oficial |
| Auditoria e testes | insuficiente para processos de RH |

## Prioridade crítica

### 1. Segregar dados pessoais, médicos e financeiros

Atualmente a função de acesso por funcionário permite que perfis da mesma obra consultem o registro do colaborador. Como salário, banco, endereço, contato de emergência, documentos e afastamentos ficam em tabelas acessadas pelo mesmo critério, um perfil operacional pode receber informação além da necessidade de sua função.

Ajuste recomendado:

- criar permissões específicas: `rh_dados_pessoais`, `rh_financeiro`, `rh_medico`, `rh_documentos`, `rh_jornada` e `rh_folha`;
- restringir salário e dados bancários a RH, administradores e responsáveis financeiros;
- restringir CID e documentos médicos a perfis expressamente autorizados;
- oferecer ao gestor da obra apenas os dados operacionais necessários;
- mascarar CPF, banco e contato na listagem e nas exportações;
- registrar consultas e exportações de dados sensíveis.

### 2. Não chamar o relatório atual de folha de pagamento

O cálculo atual soma salário base, benefícios e horas extras com fator fixo de 50%. Não contempla, entre outros elementos, proporcionalidade por admissão/desligamento, faltas e atrasos, adicionais diferentes, DSR, adicional noturno, encargos, férias, 13º, descontos ou regras coletivas.

Ajuste recomendado: renomear imediatamente para **Estimativa de custo de mão de obra** e exibir aviso de que não substitui o processamento da folha. Uma folha oficial deve possuir motor de eventos configurável ou integração com sistema contábil especializado.

### 3. Corrigir a contabilização de horas extras e banco de horas

As mesmas horas extras alimentam o custo mensal com fator de 1,5 e, simultaneamente, entram como crédito integral no banco de horas. Sem uma escolha explícita entre pagamento e compensação, existe risco de pagar e creditar a mesma hora.

Ajuste recomendado:

- classificar cada evento como `pagar`, `compensar` ou `misto`;
- guardar fator, quantidade original e origem do evento;
- tratar ajustes positivos e negativos com semântica explícita;
- exigir aprovação e motivo;
- bloquear alterações após o fechamento mensal;
- manter histórico imutável de estornos, sem apagar lançamentos.

## Prioridade alta

### 4. Substituir exclusão definitiva por desligamento/inativação

A tela permite apagar o funcionário. Como várias tabelas usam exclusão em cascata, isso pode eliminar documentos, dados de RH, férias e histórico operacional.

Ajuste recomendado: remover a exclusão comum da interface. O fluxo profissional deve registrar data, motivo e responsável pelo desligamento, revogar acesso, encerrar vínculos e preservar o histórico. Exclusão física deve existir apenas para correção excepcional, com auditoria e autorização elevada.

### 5. Tornar cadastro, conta e vínculo uma operação atômica

A criação ocorre em etapas separadas: usuário de autenticação, funcionário e vínculo com obra. Se uma etapa falhar, podem restar conta órfã ou funcionário sem obra. A atualização também altera cadastro, vínculos e perfil em comandos separados, ignorando alguns erros intermediários.

Ajuste recomendado: criar uma única operação transacional no servidor para admissão/alteração. Ela deve validar tudo antes de confirmar e desfazer integralmente em caso de erro.

### 6. Corrigir a sincronização de perfil de acesso

A tabela original permite unicidade por `(user_id, role)`, mas o código tenta atualizar usando conflito somente em `user_id`. Essa combinação não é garantida pelo esquema e pode falhar ou deixar mais de um perfil por usuário. A própria conta sintética criada na auditoria recebeu inicialmente o perfil padrão.

Ajuste recomendado: decidir formalmente entre um ou vários perfis. Para o modelo atual, criar unicidade em `user_id`, migrar duplicidades e centralizar a troca de cargo/perfil em função transacional auditada.

### 7. Implementar fechamento e aprovação do ponto

O ponto permite edição e importação, mas não possui ciclo formal de rascunho, conferência, aprovação, fechamento e reabertura autorizada. Horas extras podem ser informadas manualmente sem justificativa ou aprovação obrigatória.

Ajuste recomendado:

- estados `aberto`, `enviado`, `aprovado`, `fechado` e `reaberto`;
- aprovador, data e justificativa;
- bloqueio de período fechado;
- justificativa obrigatória para edição manual e hora extra;
- comparação com escala, intervalo e marcações originais;
- suporte explícito a jornadas que atravessam a meia-noite.

### 8. Melhorar férias, afastamentos e documentos

O cadastro atual aceita datas sem regras suficientes e remove registros definitivamente. Não há workflow de solicitação/aprovação, prevenção de sobreposição, atualização automática de status ou controle robusto do período aquisitivo. Documentos são cadastrados por URL manual, sem evidência de armazenamento privado e versionamento.

Ajuste recomendado:

- validar início/fim, sobreposição e quantidade de dias;
- separar férias, licença, atestado e afastamento em processos adequados;
- atualizar o status do funcionário por período, sem depender de edição manual;
- armazenar arquivos em bucket privado com links temporários;
- registrar versão, emissor, aprovação e substituição;
- diferenciar documentos vencidos dos que vencerão em 30 dias.

## Prioridade média

### 9. Melhorar validações cadastrais

- CPF verifica apenas quantidade mínima de caracteres, não dígitos e formato;
- senha mínima de seis caracteres é fraca para perfis gestores;
- data de admissão é opcional;
- faltam regras claras para e-mail corporativo, duplicidades e datas futuras;
- campos textuais aceitam valores fora dos domínios documentados no banco.

Recomenda-se normalizar CPF/telefone/CEP, validar CPF, aplicar política de senha mais forte e adicionar restrições `CHECK` ou enums aos campos controlados.

### 10. Corrigir alocação de custos entre obras

O relatório seleciona apenas o primeiro vínculo ativo encontrado e atribui todo o salário a essa obra. Para funcionários compartilhados, o custo pode ficar na obra errada ou não refletir o período trabalhado.

Recomenda-se manter vigência e percentual/critério de rateio por obra, usando horas efetivamente apontadas ou regra contábil configurada.

### 11. Adicionar auditoria operacional

Os principais registros de RH não possuem histórico completo de alteração. É necessário registrar quem consultou, criou, alterou, aprovou, exportou, fechou ou estornou informações sensíveis, preservando valor anterior e novo valor quando apropriado.

### 12. Criar testes automatizados específicos de RH

Não há suíte dedicada para admissão, alteração de cargo, vínculo, ponto, férias, documentos, banco de horas e custo de pessoal.

Cobertura mínima recomendada:

- admissão completa e reversão em caso de falha;
- troca de cargo e atualização do único perfil;
- bloqueio de dados financeiros e médicos por perfil;
- isolamento entre obras para cadastro, ponto e folha;
- cálculo de jornada comum, intervalo e virada de dia;
- escolha entre HE paga e banco de horas;
- fechamento e tentativa de edição posterior;
- férias sobrepostas e documentos vencidos;
- desligamento com preservação do histórico.

## Pontos positivos existentes

- estrutura de cargos e departamentos;
- vínculo de funcionário com obra;
- isolamento RLS por funcionário/obra já fortalecido;
- escalas e períodos;
- captura de ponto por supervisor, campo, CSV e totem;
- dossiê complementar com contrato, banco, benefícios e contato de emergência;
- controle inicial de documentos e vencimentos;
- férias e ausências;
- banco de horas e relatórios exportáveis;
- interface organizada e adaptada ao contexto de obras.

## Plano recomendado

### Fase 1 — proteção e confiabilidade

1. separar permissões de RH por domínio;
2. retirar exclusão definitiva;
3. corrigir unicidade/sincronização de perfil;
4. tornar admissão e alteração transacionais;
5. renomear a folha para estimativa de custo.

### Fase 2 — jornada e cálculo

1. implementar fechamento do ponto;
2. classificar HE paga versus banco;
3. adicionar aprovação e estorno;
4. corrigir rateio por obra;
5. criar testes de cálculo e isolamento.

### Fase 3 — processo profissional de RH

1. workflow de admissão e checklist documental;
2. workflow de férias e afastamentos;
3. desligamento com revogação de acesso;
4. arquivos privados e versionados;
5. integração contábil ou motor formal de folha;
6. dashboards de pendências, vencimentos e conformidade.

## Conclusão

O módulo pode evoluir para um RH profissional sem recomeçar do zero. A fundação é aproveitável, mas as fases 1 e 2 devem ser concluídas antes de usar os valores como folha oficial ou liberar dados sensíveis para equipes operacionais. Para regras trabalhistas, fiscais e de proteção de dados aplicáveis à empresa, a configuração final deve ser validada por profissionais responsáveis dessas áreas.

## Progresso de implementação

A Fase 1 foi implementada no código e na migration `20260822000017_professionalize_hr_core.sql`. As instruções de aplicação e validação estão em `docs/rh-fase1-aplicacao.md`. Permanecem para as próximas fases o fechamento formal do ponto, a classificação de horas extras, o rateio entre obras e os workflows completos de férias/documentos.
