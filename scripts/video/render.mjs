import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const audioPath = process.argv[2];
if (!audioPath) throw new Error('Informe o caminho do áudio MP3.');

const root = path.resolve('output/video');
const captures = path.join(root, 'capturas');
const slides = path.join(root, 'slides');
const ffmpeg = 'C:\\Program Files\\Agent\\dlls\\x64\\ffmpeg.exe';
const output = path.join(root, 'apice-gestao-apresentacao.mp4');
const audioDuration = 257.23;

const sceneSpecs = [
  ['01-app-motorista', 'APP DO MOTORISTA', 'Checklist, lançamentos, escala e comunicação', 72],
  ['02-frota-gps', 'RASTREAMENTO INTEGRADO', 'GPS, odômetro e sincronização da frota', 30],
  ['03-checkpoints', 'VELOCIDADE EM ÁREAS CRÍTICAS', 'Checkpoints, passagens e tratativas', 38],
  ['04-app-apontador', 'APP DO APONTADOR', 'Presença e jornada registradas na obra', 30],
  ['05-dashboard', 'VISÃO EXECUTIVA', 'Indicadores conectados à operação', 20],
  ['06-funcionarios', 'GESTÃO DE PESSOAS', 'Cadastro, cargos, setores e lotação', 12],
  ['07-espelho-ponto', 'EFETIVO E PONTO', 'Jornada, pendências e justificativas', 12],
  ['08-controle-acesso', 'CONTROLE DE ACESSO', 'Perfis, permissões e auditoria', 19],
  ['09-obras', 'GESTÃO DE OBRAS', 'Cada registro no contexto do projeto', 10],
  ['10-cronograma', 'PLANEJAMENTO', 'Cronograma e execução contratada', 9],
  ['11-almoxarifado', 'ALMOXARIFADO', 'Estoque, movimentações e requisições', 25],
  ['12-ferramentas', 'FERRAMENTAS E EQUIPAMENTOS', 'Alocação, condição e certificações', 16],
  ['13-veiculos-pesados', 'FROTA PESADA', 'Operador, fornecedor e custos de locação', 19],
  ['14-sms', 'SMS E PREVENÇÃO', 'Inspeções, APR, DDS, EPIs e treinamentos', 24],
  ['15-qualidade', 'QUALIDADE', 'Evidências e planos de ação', 14],
  ['16-alojamentos', 'ALOJAMENTOS', 'Ocupação, disponibilidade e custos', 14],
  ['17-visitantes', 'PORTARIA E VISITANTES', 'Briefing, credenciais e histórico', 14],
  ['18-orcado-realizado', 'ORÇADO × REALIZADO', 'Custos por categoria e obra', 10],
  ['19-fundo-fixo', 'FUNDO FIXO', 'Despesas com rastreabilidade', 8],
  ['20-relatorios', 'RELATÓRIOS', 'Informação para decidir', 8],
  ['21-portal-cliente', 'PORTAL DO CLIENTE', 'Compartilhamento controlado', 12],
];

const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const manifest = JSON.parse(await readFile(path.join(captures, 'manifest.json'), 'utf8'));
const available = new Map(manifest.filter(item => item.status === 'captured').map(item => [item.name, item]));
const selected = sceneSpecs.filter(([name]) => available.has(name));
if (selected.length < 8) throw new Error(`Apenas ${selected.length} telas disponíveis; revise as capturas antes de editar.`);

await mkdir(slides, { recursive: true });
const totalWeight = selected.reduce((sum, scene) => sum + scene[3], 0);
const durations = selected.map(scene => audioDuration * scene[3] / totalWeight);
const paths = [];

for (let i = 0; i < selected.length; i++) {
  const [name, title, subtitle] = selected[i];
  const capturePath = path.join(captures, available.get(name).filename);
  const meta = await sharp(capturePath).metadata();
  const isMobile = available.get(name).layout === 'mobile';
  let frame;

  if (isMobile) {
    const phone = await sharp(capturePath).resize({ height: 900, fit: 'inside' }).png().toBuffer();
    const phoneMeta = await sharp(phone).metadata();
    const phoneX = 1240;
    const phoneY = Math.round((1080 - phoneMeta.height) / 2);
    const background = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#101e38"/><stop offset="1" stop-color="#2457d6"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><circle cx="1750" cy="150" r="310" fill="#ffffff" opacity=".04"/><text x="120" y="180" fill="#88acff" font-family="Arial" font-size="29" font-weight="700">ÁPICE GESTÃO</text><text x="120" y="330" fill="#ffffff" font-family="Arial" font-size="70" font-weight="700">${escapeXml(title)}</text><text x="120" y="405" fill="#dbe7ff" font-family="Arial" font-size="31">${escapeXml(subtitle)}</text><rect x="118" y="455" width="600" height="5" rx="2" fill="#f5b841"/><text x="120" y="910" fill="#b9cdf4" font-family="Arial" font-size="24">DO CAMPO À GESTÃO</text></svg>`);
    frame = await sharp(background).composite([{ input: phone, left: phoneX, top: phoneY }]).png().toBuffer();
  } else {
    const screen = await sharp(capturePath).resize(1920, 1080, { fit: 'cover' }).png().toBuffer();
    const overlay = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1920" height="126" fill="#0b1f3a" opacity=".95"/><rect y="126" width="1920" height="6" fill="#2b61e5"/><text x="78" y="74" fill="#ffffff" font-family="Arial" font-size="44" font-weight="700">${escapeXml(title)}</text><text x="80" y="109" fill="#b9cdf4" font-family="Arial" font-size="21">${escapeXml(subtitle)}</text><rect y="1020" width="1920" height="60" fill="#0b1f3a" opacity=".94"/><text x="80" y="1059" fill="#f5b841" font-family="Arial" font-size="23" font-weight="700">ÁPICE GESTÃO</text><text x="1790" y="1059" fill="#b9cdf4" font-family="Arial" font-size="20" text-anchor="end">${String(i + 1).padStart(2, '0')} / ${String(selected.length).padStart(2, '0')}</text></svg>`);
    frame = await sharp(screen).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();
  }

  const slidePath = path.join(slides, `${String(i + 1).padStart(2, '0')}-${name}.png`);
  await writeFile(slidePath, frame);
  paths.push(slidePath);
  console.log(`Slide ${i + 1}/${selected.length}: ${name} (${meta.width}×${meta.height})`);
}

const quote = value => `'${value.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
const concat = paths.map((file, i) => `file ${quote(file)}\nduration ${durations[i].toFixed(3)}`).join('\n') + `\nfile ${quote(paths.at(-1))}\n`;
const listPath = path.join(slides, 'cenas.txt');
await writeFile(listPath, concat);

await new Promise((resolve, reject) => {
  const proc = spawn(ffmpeg, [
    '-y', '-hide_banner', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-i', audioPath, '-r', '25', '-c:v', 'libx264', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', String(audioDuration),
    '-movflags', '+faststart', output,
  ], { stdio: 'inherit' });
  proc.on('error', reject);
  proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg terminou com código ${code}`)));
});

console.log(`Vídeo criado: ${output}`);
