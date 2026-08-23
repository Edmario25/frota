# Ápice Gestão

Plataforma web e móvel para gestão de frota, obras, pessoas, segurança do trabalho e operações de campo.

## Visão geral

O sistema reúne:

- frota leve e pesada, locações, transferências e devoluções;
- manutenção, abastecimento, pneus, lavagens, multas e inspeções;
- funcionários, cargos, departamentos, escalas, ponto e banco de horas;
- obras, fornecedores, subcontratadas, cronograma e orçamento;
- almoxarifado, ferramentas, fundo fixo e relatórios;
- módulos de SMS: DDS, APR, EPI, RDO, treinamentos e conformidade;
- aplicativos de motorista, campo e totem;
- operação PWA/offline e integração com Traccar.

## Tecnologias

- React 18, TypeScript e Vite
- Tailwind CSS, shadcn/ui e Radix UI
- TanStack React Query
- Supabase Auth, PostgreSQL, Storage, Realtime e Edge Functions
- Capacitor para Android
- Playwright para testes de interface
- Docker e Nginx para produção

## Requisitos

- Node.js 22 (mesma versão usada no Docker)
- npm
- acesso a uma instância Supabase compatível
- Chromium do Playwright para executar testes de interface
- Android Studio/JDK somente para gerar aplicativos Android

## Desenvolvimento local

```bash
npm ci
copy .env.example .env
npm run dev
```

No Linux ou macOS, use `cp .env.example .env`.

Configure no `.env`:

```dotenv
VITE_SUPABASE_PROJECT_ID="seu-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-chave-anon"
VITE_SUPABASE_URL="https://seu-endereco-supabase"
```

A chave usada no navegador deve ser a chave pública `anon`. Nunca coloque a chave `service_role` em arquivos `VITE_*`, no frontend ou no Git.

## Comandos principais

| Comando | Finalidade |
|---|---|
| `npm run dev` | Inicia o ambiente local |
| `npm run build` | Gera a aplicação de produção em `dist/` |
| `npm run lint` | Executa as regras de qualidade |
| `npm run test:e2e` | Executa os testes Playwright |
| `npm run check` | Executa lint, TypeScript, testes e build |
| `npm run preview` | Visualiza localmente o build de produção |

Na primeira execução dos testes, instale o navegador:

```bash
npx playwright install chromium
```

## Estrutura do repositório

```text
src/
  components/          componentes visuais e módulos de domínio
  contexts/            autenticação e contextos globais
  hooks/               consultas, mutações e regras reutilizáveis
  integrations/        cliente e tipos do Supabase
  lib/                 offline, sincronização e utilitários
  pages/               páginas web e experiências móveis
supabase/
  functions/           Edge Functions
  migrations/          evolução versionada do banco e políticas RLS
capacitor-campo/        aplicativo do apontador de campo
capacitor-motorista/    aplicativo do motorista
capacitor-totem/        aplicativo de ponto por QR Code
e2e/                    testes de interface
docs/                   documentação funcional e operacional
```

As páginas são carregadas sob demanda em `src/App.tsx`. Evite voltar a imports estáticos de páginas nessa entrada, pois isso aumenta o pacote inicial.

## Banco de dados e Supabase

As migrations em `supabase/migrations/` são a fonte versionada da estrutura do banco. Novas mudanças devem ser feitas por uma migration nova; não altere migrations já aplicadas em produção.

Antes de publicar uma migration:

1. teste em uma instância de desenvolvimento ou banco descartável;
2. confirme políticas RLS para leitura, criação, alteração e exclusão;
3. valide o isolamento por obra e por cargo;
4. regenere os tipos TypeScript do Supabase;
5. registre plano de rollback quando houver transformação de dados.

As Edge Functions usam segredos fornecidos pelo ambiente Supabase. A chave `service_role` deve permanecer somente nesse ambiente.

## Controle de acesso

As rotas escondem telas conforme o perfil, mas a proteção definitiva deve existir no banco por meio de RLS e nas Edge Functions.

Consulte [docs/controle-de-acesso.md](docs/controle-de-acesso.md) para a matriz funcional existente.

## Aplicativos Android

Cada aplicativo Capacitor possui dependências e comandos próprios. Entre no diretório desejado, instale as dependências e faça o build:

```bash
cd capacitor-motorista
npm ci
npm run cap:apk
```

Para Campo e Totem, use `npm run build`, `npm run cap:sync` e depois abra o projeto com `npm run cap:open`.

O aplicativo SMS hospedado possui instruções adicionais em [docs/gerar-apk-sms.md](docs/gerar-apk-sms.md).

## Produção com Docker

```bash
docker build -t apice-gestao .
docker run --rm -p 8080:80 apice-gestao
```

O Nginx está configurado para rotas SPA, compressão e cache de arquivos estáticos. Variáveis `VITE_*` são incorporadas durante o build e devem estar disponíveis na construção da imagem.

## Estratégia de validação

Antes de integrar uma mudança:

```bash
npm run check
```

Os testes atuais cobrem a tela de login, validações básicas e redirecionamento de rotas sem sessão. A expansão prioritária deve cobrir permissões, isolamento por obra, ciclos de quilometragem, ponto, estoque e sincronização offline.

## Documentação adicional

- [Controle de acesso](docs/controle-de-acesso.md)
- [Geração do APK SMS](docs/gerar-apk-sms.md)
- [Roadmap funcional](docs/roadmap-completo.md)
- [Dívida técnica e prioridades](docs/divida-tecnica.md)
- [Auditoria de segurança](docs/auditoria-seguranca.md)
