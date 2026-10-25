# Internacionalização do Ápice Gestão

## Idiomas

- `pt-BR`: português e idioma padrão;
- `en`: inglês;
- `es`: espanhol.

O seletor aparece no login e no cabeçalho do sistema gerencial. A preferência fica no navegador sob a chave `apice-language`, é compartilhada entre abas e atualiza `document.documentElement.lang`. O sistema usa português quando a preferência está ausente, inválida ou indisponível.

## Regras

- Textos fixos da interface usam a frase em português como chave de `src/i18n/catalog.ts` e `t("Texto")` ou `<T>Texto</T>` para renderização.
- Nomes, observações e outros valores registrados por usuários não são traduzidos.
- Valores internos do banco, como `em_andamento`, continuam imutáveis; somente o rótulo exibido é traduzido.
- Parâmetros usam marcadores nomeados: `t("{count} veículos", { count })`. Todos os idiomas devem possuir os mesmos marcadores.
- Datas e números usam os formatadores de `useI18n`. Datas no formato `AAAA-MM-DD` são interpretadas no horário local para não retroceder um dia.
- Trocar o idioma não converte moeda. `money` preserva BRL por padrão, alterando somente a apresentação.
- Mensagens técnicas do banco devem ser convertidas em códigos de erro antes de serem traduzidas. Não se deve traduzir texto SQL por comparação livre.

## Verificação

Executar `node scripts/test-i18n.mjs` para validar os três idiomas, marcadores, fallback seguro, datas, números e moeda. Executar também o build da aplicação. A inclusão de uma tela no catálogo deve ser acompanhada de conferência visual nos três idiomas, porque inglês e espanhol podem ocupar mais espaço.

## Valores gravados no banco

Descrições que o sistema grava como registro do usuário permanecem em português, porque são dados e não interface. É o caso dos itens do checklist de inspeção de veículo pesado (`item_nome`) e de suas categorias, gravados em cada inspeção. Traduzir o rótulo exibido desses itens exige um mapa próprio, como `siteStatus.ts` faz para o status de obra, mantendo o valor gravado intacto.

## Cobertura atual

A infraestrutura, login, tratamento global de erro, menu, cabeçalho, painel principal, gráficos de frota, paginação, diálogos, cadastro de funcionários e lista de obras estão integrados.

O módulo de frota está concluído: cadastro e edição de veículo leve e pesado, painel do Traccar, baixa de veículo, devolução, transferência, QR Code do veículo, aviso de avaria, locadora, célula de quilometragem, visualização e detalhe do veículo leve, e, nos veículos pesados, visualização, detalhe, baixa e as telas de inspeção. Os registros operacionais exibidos nessas telas (manutenção, acessórios, teste de fumaça, borracharia, multas, avarias, lavagens, abastecimento e centro de custo) usam `number`, `money` e `date` do `useI18n`, de modo que a formatação acompanha o idioma e a moeda continua em BRL.

Os formulários e detalhes chamados a partir do detalhe do veículo também estão concluídos: manutenção (formulário, detalhe, histórico e avaria), acessórios, teste de fumaça, borracharia, multas, checklist de inspeção, lavagem e abastecimento. Nessas telas, mensagens de validação e avisos (`toast`) passam pelo catálogo, valores monetários usam `money`, quantidades usam `number`, datas usam `date` e os seletores de data seguem o idioma escolhido, no mesmo padrão de `EscalaPeriodoFormModal`.

Obras também estão concluídas: formulário, detalhe, arquivamento, equipes e as três telas de vinculação (fornecedor, funcionário e veículo). Em RH, estão concluídos a admissão, o desligamento, a ficha do funcionário, o crachá com QR e o prontuário de RH (pessoal, contrato, financeiro, documentos, férias e SSMA), além da portaria de visitantes (autenticação de entrada e credencial impressa).

Também estão concluídos: alojamentos (mapa, painel de leitos, alojados, chamados, custos, patrimônio e relatórios), fornecedores (cadastro, detalhe, inativação e vínculo com obra), controle de acesso (usuários, governança e comparação de regras), configurações (identidade visual, dados da empresa, parâmetros de frota e Traccar), fundo fixo, os cards do app do motorista (veículo, escala, manutenções e infrações), a tela de acesso negado e a captura de foto em campo.

Faltam as páginas dos módulos operacionais (efetivo e ponto, almoxarifado, ferramentas, cronograma, subcontratadas, orçado × realizado, portal do cliente, qualidade e comunicados), o módulo SMS/SSMA, os relatórios e os aplicativos Android. Cada tela incluída deve ser acrescentada à lista `fleetFiles` de `scripts/test-i18n.mjs`, que cobra texto não traduzido e chave ausente no catálogo.

## Cuidados aprendidos na migração

- O nome da marca (`ÁPICE`, `GESTÃO`) não entra no catálogo.
- Um texto que envolve um valor deve ser uma única chave com marcador (`"Equipes — {site}"`), nunca pedaços de frase concatenados, porque a ordem das palavras muda entre idiomas.
- Quando um `map` nomeia o parâmetro `t`, o tradutor fica escondido; renomeie o parâmetro antes de usar `t()` dentro do laço.
- Arquivos com vários componentes precisam de `useI18n()` em cada componente que traduz, e helpers de módulo (fora de componente) devem receber o formatador por parâmetro, como `fmt(data, date)` no prontuário de RH.
- `Label`, `Button`, `Card`, `Dialog`, `AlertDialog`, `Select`, `Table`, `Tabs`, `Input` e `Textarea` já traduzem texto simples e `placeholder`, então um rótulo passado a esses componentes precisa apenas da chave no catálogo. O mesmo vale para componentes locais que repassam o rótulo a um `Label`, como `Campo` e `Field`.
- Mensagens do `sonner` (`toast.success`, `toast.error`) e textos passados como argumento a um helper interno também precisam de `t()`; não basta traduzir o JSX.
- Chave nunca contém quebra de linha nem aspas retas: um texto JSX em várias linhas deve ser normalizado em uma linha, e aspas no meio da frase usam as tipográficas (`“ ”`).
- Um valor formatado para o idioma não entra em chave: use `number`, `money` e `date` no lugar de `toLocaleString("pt-BR")`, `toFixed` e `format(..., { locale: ptBR })`.
