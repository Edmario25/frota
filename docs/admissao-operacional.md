# Integração e liberação para obra

## Atualização

Esta entrega exige a migração `supabase/migrations/20260830000002_admissao_operacional.sql` e a publicação do frontend correspondente. Não foi executada no banco de produção. Faça backup e teste em homologação antes de publicar. A base deve conter as migrações anteriores de SMS, integração SMS/RH, saúde ocupacional e assinatura de entrega de EPI. Não aplique este SQL em uma base vazia.

Coordene SQL e publicação em uma janela de manutenção: a tela antiga grava diretamente em tabelas; a nova utiliza operações controladas. Após o SQL, clientes antigos podem receber erro de permissão até atualizar a página.

## Fluxo

1. Vincule o funcionário ativo à obra. O processo é criado automaticamente; Novo processo também recupera um processo existente, sem duplicar.
2. Defina responsável, prazo, perfil e requisitos aplicáveis. Modelos da obra reutilizam requisitos, nunca validações ou anexos de outra pessoa.
3. Anexe e confira cada documento. Recebido não significa validado. Recusa e não aplicabilidade exigem justificativa.
4. Selecione a integração efetivamente registrada em treinamentos, os treinamentos exigidos e os EPIs esperados. ASO e entregas assinadas são consultados nos registros de origem; não há caixa manual para substituir uma entrega.
5. Salve, confira RH e SMS e solicite a liberação. O banco reavalia as pendências, mesmo que a tela esteja desatualizada.

Conferências são invalidadas quando o processo é alterado ou recebe novo anexo. Processos concluídos exigem reabertura justificada. Vencimentos e alterações nas fontes aparecem como revisão necessária; não há integração automática desta entrega com catraca, bloqueio físico ou push.

Liberação exige vínculo ativo, funcionário ativo, início não futuro, ausência de férias aprovadas vigentes, responsável/prazo, documentos conferidos, ausência de anexos públicos legados, ASO vigente com aptidão apto, treinamentos obrigatórios/exigidos vigentes, integração da mesma obra posterior ao início com instrutor e referência de certificado, EPIs assinados não devolvidos ou justificativa de não aplicabilidade e as duas conferências. A aptidão com restrição permanece pendente para avaliação do responsável; esta tela não decide restrições médicas.

Admin/gestor de contrato/gestor da obra podem conferir RH e liberar, respeitando o escopo de acesso. Técnico SMS pode conferir SMS e documentos SMS, mas não consultar anexos RH ou liberar. Não é exigido que RH e SMS sejam pessoas diferentes. Ajuste os perfis organizacionais antes da implantação se precisar dessa separação.

## Documentos antigos — atenção obrigatória

A migração SQL preserva `documentos_urls` e registra as referências antigas. Não transforma arquivos públicos em privados e não apaga nenhum arquivo. Conclusões anteriores não são automaticamente homologadas: aparecem como conclusão legada e devem ser reabertas para revisão.

O bucket novo `admissao-documentos` é privado. Novos anexos usam endereço temporário de 60 segundos, acesso por obra/área e objetos sem sobrescrita. O bucket compartilhado `sms-midias` não é alterado, pois atende outros módulos.

O operador deve usar `scripts/migrar-documentos-admissao.mjs` em ambiente controlado, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` definidos apenas na sessão local. Nunca coloque a chave no frontend, no Git ou em mensagens.

```powershell
# Primeiro: relatório, sem gravação
node scripts/migrar-documentos-admissao.mjs

# Depois: copiar e verificar integridade; originais públicos permanecem
node scripts/migrar-documentos-admissao.mjs --apply

# Somente após conferir backup, cópias e escopo: remover originais públicos
node scripts/migrar-documentos-admissao.mjs --apply --remove-public-originals
```

A última opção altera referências antigas e remove o original público somente após conferir as cópias privadas por SHA-256. Os documentos continuam disponíveis nas cópias privadas; links públicos antigos deixam de funcionar. Isso não recolhe cópias externas ou caches já existentes. Evite uploads/edições simultâneos durante a operação. Faça o relatório novamente e confira falhas antes de liberar o uso.

O script aceita apenas URLs da mesma origem configurada, bucket `sms-midias`, pasta `admissao/`, formatos PDF/JPEG/PNG/WebP e até 10 MB. Arquivos externos, outros caminhos e formatos exigem migração manual revisada; não serão apagados pelo script. Referências ainda públicas continuam impedindo a liberação. Se houver falha parcial, preserve logs e cópias; reexecute após resolver a causa. Não limpe manualmente `legado_url` sem comprovar a remoção da exposição pública.

Registros antigos sem obra não são liberáveis. Um administrador deve preservar o histórico, cancelar o processo antigo com justificativa e criar o processo na obra correta; evidências necessárias devem ser migradas e reapresentadas no novo processo. Não há reassociação silenciosa de documentos entre obras.

## Validação

Foram preparados testes unitários, SQL em PostgreSQL isolado (PGlite) e testes de interface com respostas simuladas. Não substituem homologação com o esquema real, usuários reais e Storage do projeto. Verifique especialmente: técnico sem acesso RH, acesso de outra obra negado, upload/abertura privada, ASO vencido, EPI sem assinatura, conclusão incompleta, edição concorrente e reativação de vínculo.

O módulo organiza a conferência operacional; não certifica conformidade legal nem substitui avaliações de RH ou saúde ocupacional.
