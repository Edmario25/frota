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

## Cobertura atual

A infraestrutura, login, tratamento global de erro, menu, cabeçalho, painel principal, gráficos de frota, paginação, diálogos, cadastro de funcionários e lista de obras estão integrados. Os formulários internos, relatórios, módulos operacionais e aplicativos Android devem ser migrados por módulo antes de considerar a internacionalização completa.
