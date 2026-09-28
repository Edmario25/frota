import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://localhost:8080';
const outputDir = path.resolve('output/video/capturas');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const scenes = [
  ['01-app-motorista', '/app', 'mobile'],
  ['02-frota-gps', '/frota', 'desktop'],
  ['03-checkpoints', '/sms/velocidade', 'desktop'],
  ['04-app-apontador', '/app-campo', 'mobile'],
  ['05-dashboard', '/', 'desktop'],
  ['06-funcionarios', '/funcionarios', 'desktop'],
  ['07-espelho-ponto', '/efetivo/relatorio', 'desktop'],
  ['08-controle-acesso', '/controle-acesso', 'desktop'],
  ['09-obras', '/obras', 'desktop'],
  ['10-cronograma', '/cronograma', 'desktop'],
  ['11-almoxarifado', '/almoxarifado', 'desktop'],
  ['12-ferramentas', '/ferramentas', 'desktop'],
  ['13-veiculos-pesados', '/veiculos-pesados', 'desktop'],
  ['14-sms', '/sms', 'desktop'],
  ['15-qualidade', '/qualidade', 'desktop'],
  ['16-alojamentos', '/alojamentos', 'desktop'],
  ['17-visitantes', '/visitantes', 'desktop'],
  ['18-orcado-realizado', '/orcado-realizado', 'desktop'],
  ['19-fundo-fixo', '/fundo-fixo', 'desktop'],
  ['20-relatorios', '/relatorios', 'desktop'],
  ['21-portal-cliente', '/portal-cliente', 'desktop'],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: false, executablePath: chromePath, args: ['--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
console.log('Janela de captura aberta. Faça login nela; aguardando o Dashboard...');

try {
  await page.getByRole('heading', { name: /Dashboard/i }).first().waitFor({ state: 'visible', timeout: 0 });
  console.log('Sessão autenticada. Capturando módulos...');

  const manifest = [];
  for (const [name, route, layout] of scenes) {
    await page.setViewportSize(layout === 'mobile' ? { width: 430, height: 900 } : { width: 1600, height: 900 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1300);

    const actualPath = new URL(page.url()).pathname;
    const errorVisible = await page.getByText('Ocorreu um erro inesperado').isVisible().catch(() => false);
    if (actualPath !== route || errorVisible) {
      manifest.push({ name, route, status: 'skipped', actualPath, reason: errorVisible ? 'page error' : 'redirected' });
      console.log(`Ignorado: ${route} → ${actualPath}${errorVisible ? ' (erro)' : ''}`);
      continue;
    }

    // Redact personal identifiers in this disposable capture context only.
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (!node.textContent) continue;
        node.textContent = node.textContent
          .replace(/edimario[.\s]ribeiro/gi, 'gestor da obra')
          .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**')
          .replace(/\b\d{11}\b/g, '***********')
          .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'contato@exemplo.com')
          .replace(/\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/gi, 'ABC1D23');
      }
    });
    await page.addStyleTag({ content: 'table tbody td:first-child, [data-sensitive] { filter: blur(7px) !important; }' });

    const filename = `${name}.png`;
    await page.screenshot({ path: path.join(outputDir, filename), animations: 'disabled', mask: [page.locator('input[type="password"]')], maskColor: '#dbe7f4' });
    manifest.push({ name, route, status: 'captured', filename, layout });
    console.log(`Capturado: ${filename}`);
  }
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Capturas concluídas em ${outputDir}`);
} finally {
  await browser.close();
}
