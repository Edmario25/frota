import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('output/video');
const framesDir = path.join(root, 'frames-publicitario');
const ffmpeg = 'C:\\Program Files\\Agent\\dlls\\x64\\ffmpeg.exe';
const audio = 'C:\\Users\\Xtreme\\Downloads\\ElevenLabs_2026-09-24T18_05_24_Fernando Borges - Urgent and Encouraging_pvc_sp82_s35_sb75_v3.mp3';
const output = path.join(root, 'apice-gestao-video-publicitario-v2.mp4');
const audioDuration = 257.23;
const W = 1920;
const H = 1080;

const scenes = [
  { key: 'abertura', title: 'A OBRA COMEÇA NO CAMPO', kicker: 'ÁPICE GESTÃO', mode: 'phone', asset: 'preview-app-motorista.png', items: ['Motorista, apontador e canteiro conectados', 'Uma plataforma para a operação e a gestão'] },
  { key: 'motorista', title: 'APP DO MOTORISTA', kicker: 'OPERAÇÃO MÓVEL', mode: 'phone', asset: 'preview-app-motorista.png', items: ['Veículo e escala em um só lugar', 'Comunicação direta com a gestão', 'Informação útil para a rotina'] },
  { key: 'motorista-registros', title: 'ROTINA REGISTRADA', kicker: 'APP DO MOTORISTA', mode: 'panel', items: ['Checklist de inspeção', 'Abastecimento e manutenção', 'Avarias, multas, pneus e lavagens', 'Sincronização após ficar offline'] },
  { key: 'gps', title: 'RASTREAMENTO INTEGRADO', kicker: 'FROTA', mode: 'panel', items: ['Rastreador vinculado ao veículo', 'Posição e status de comunicação', 'Odômetro e quilometragem', 'Apoio à conferência de contratos'] },
  { key: 'checkpoint', title: 'VELOCIDADE SOB CONTROLE', kicker: 'CHECKPOINTS NO CANTEIRO', mode: 'photo', asset: 'checkpoint-radar-estrada-terra.png', items: ['Limite por área crítica', 'Passagem identificada e rastreável', 'Excedentes geram tratativas'] },
  { key: 'apontador', title: 'APP DO APONTADOR', kicker: 'PRESENÇA NO CAMPO', mode: 'phone', asset: 'preview-app-apontador-campo.png', items: ['Equipe vinculada à obra', 'Crachá com QR Code ou busca', 'Jornada e lista do dia', 'Registros offline sincronizáveis'] },
  { key: 'gestao', title: 'DO CAMPO À GESTÃO', kicker: 'VISÃO EXECUTIVA', mode: 'screenshot', asset: 'capturas/dashboard-original.png', items: ['Indicadores da operação', 'Frota e pessoas no mesmo ambiente', 'Consultas e relatórios conectados', 'Menos redigitação'] },
  { key: 'pessoas', title: 'GESTÃO DE PESSOAS', kicker: 'RH E JORNADA', mode: 'panel', items: ['Cadastro, cargos, departamentos e setores', 'Lotação, escalas e Ponto QR', 'Presenças e justificativas', 'Espelho de ponto'] },
  { key: 'acesso', title: 'ACESSO COM GOVERNANÇA', kicker: 'SEGURANÇA DA INFORMAÇÃO', mode: 'panel', items: ['Usuários e perfis', 'Permissões por função e escopo', 'Substituições e revisões', 'Auditoria das ações relevantes'] },
  { key: 'obras', title: 'PLANEJAMENTO E EXECUÇÃO', kicker: 'PROJETOS', mode: 'panel', items: ['Obras e responsáveis', 'Cronograma e etapas', 'Subcontratadas e contratos', 'Tudo vinculado ao projeto certo'] },
  { key: 'almox', title: 'APP DO ALMOXARIFADO', kicker: 'SUPRIMENTOS', mode: 'phone', asset: 'preview-app-almoxarifado.png', items: ['Estoque por obra', 'Saída e devolução com conferência', 'Materiais, requisições e inventário', 'Distribuição registrada no campo'] },
  { key: 'ativos', title: 'ATIVOS E FORNECEDORES', kicker: 'CONTROLE PATRIMONIAL', mode: 'panel', items: ['Cadastro de fornecedores', 'Ferramentas e equipamentos', 'Alocação e responsáveis', 'Condição e certificações'] },
  { key: 'pesados', title: 'FROTA PESADA E CUSTOS', kicker: 'FROTA', mode: 'panel', items: ['Veículos e operadores', 'Fornecedor e contrato de locação', 'Manutenção e conservação', 'Mensalidade, franquia e excedentes'] },
  { key: 'sms', title: 'SMS E PREVENÇÃO', kicker: 'SAÚDE, MEIO AMBIENTE E SEGURANÇA', mode: 'panel', items: ['Inspeções e desvios', 'Ocorrências, APR e DDS', 'EPIs e treinamentos', 'Requisitos legais e prazos'] },
  { key: 'qualidade', title: 'QUALIDADE COM EVIDÊNCIAS', kicker: 'CONTROLE TÉCNICO', mode: 'panel', items: ['Não conformidades', 'Registros diários de obra', 'Evidências e responsáveis', 'Planos de ação com histórico'] },
  { key: 'alojamentos', title: 'GESTÃO DE ALOJAMENTOS', kicker: 'PESSOAS NA OBRA', mode: 'panel', items: ['Capacidade e ocupação', 'Leitos disponíveis', 'Manutenção e bloqueios', 'Custos e relatórios'] },
  { key: 'visitantes', title: 'PORTARIA E VISITANTES', kicker: 'ACESSO À OBRA', mode: 'panel', items: ['Documentos e briefing de segurança', 'Crachás com validade', 'QR Code para pessoa e veículo', 'Histórico de entradas e saídas'] },
  { key: 'custos', title: 'INFORMAÇÃO PARA DECIDIR', kicker: 'GESTÃO FINANCEIRA', mode: 'panel', items: ['Orçado × Realizado', 'Fundo fixo', 'Relatórios gerenciais', 'Portal do cliente e comunicados'] },
  { key: 'fecho', title: 'ÁPICE GESTÃO', kicker: 'DO CAMPO AO RESULTADO', mode: 'closing', items: ['Mais clareza para conduzir a obra', 'Operação, segurança e gestão conectadas'] },
];

const paragraphs = (await readFile(path.join(root, 'locucao-apice-gestao.txt'), 'utf8'))
  .split(/\r?\n\s*\r?\n/)
  .map(s => s.trim())
  .filter(Boolean)
  .slice(1);
if (paragraphs.length !== scenes.length) throw new Error(`Esperadas ${scenes.length} falas; recebidas ${paragraphs.length}`);

// Alinhamento inicial pela quantidade de palavras da locução. Mantém a ordem
// exata dos parágrafos e usa toda a duração do áudio recebido.
const weights = paragraphs.map(p => p.split(/\s+/).length + 5);
const sum = weights.reduce((a, b) => a + b, 0);
const durations = weights.map(w => audioDuration * w / sum);

const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const lines = (s, max = 30) => {
  const out = []; let line = '';
  for (const word of s.split(' ')) {
    if (line && `${line} ${word}`.length > max) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
};
const textBlock = (s, x, y, size, color, weight = 400, max = 30, step = size * 1.22) =>
  lines(s, max).map((line, i) => `<text x="${x}" y="${y + i * step}" fill="${color}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}">${xml(line)}</text>`).join('');

function backdrop(scene, index) {
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1b35"/><stop offset="1" stop-color="#123d83"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="1710" cy="80" r="480" fill="#ffffff" opacity=".025"/><circle cx="270" cy="1070" r="450" fill="#2d6bfd" opacity=".07"/><rect x="0" y="0" width="${W}" height="8" fill="#e7af36"/>`;
  const leftMax = scene.mode === 'panel' || scene.mode === 'screenshot' ? 18 : scene.mode === 'phone' ? 27 : 30;
  const title = textBlock(scene.title, 100, 298, scene.mode === 'closing' ? 104 : 66, '#ffffff', 800, leftMax, 76);
  const titleLines = lines(scene.title, leftMax).length;
  const bulletY = 298 + titleLines * 76 + 45;
  const bullet = scene.items.map((item, i) => {
    const y = bulletY + i * 91;
    return `<circle cx="115" cy="${y - 10}" r="7" fill="#f3bc48"/>${textBlock(item, 137, y, 29, '#d8e4f8', 400, scene.mode === 'panel' ? 28 : 31, 34)}`;
  }).join('');
  const note = scene.mode === 'screenshot' ? 'INTERFACE REAL · RECORTE SEM DADOS PESSOAIS' : 'DEMONSTRAÇÃO ILUSTRATIVA · DADOS FICTÍCIOS';
  const bottom = `<text x="100" y="1015" fill="#8fb6ff" font-family="Arial,sans-serif" font-size="24" font-weight="700">ÁPICE GESTÃO</text>${scene.mode === 'phone' ? '' : `<text x="1820" y="1015" text-anchor="end" fill="#96aac9" font-family="Arial,sans-serif" font-size="20">${note}</text>`}`;
  return Buffer.from(`${base}<text x="100" y="115" fill="#f3bc48" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="3">${xml(scene.kicker)}</text>${title}${bullet}${bottom}</svg>`);
}

function featurePanel(scene) {
  const x = 945, y = 197, w = 875, h = 674;
  const colors = ['#2563eb', '#16a085', '#f2a900', '#8b5cf6'];
  const cards = scene.items.map((item, i) => {
    const cx = x + 38 + (i % 2) * 395, cy = y + 176 + Math.floor(i / 2) * 190;
    return `<rect x="${cx}" y="${cy}" width="360" height="155" rx="20" fill="#f7faff" stroke="#e2eaf5"/><rect x="${cx + 22}" y="${cy + 22}" width="43" height="43" rx="12" fill="${colors[i]}"/><text x="${cx + 43}" y="${cy + 52}" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="22" font-weight="700">${i + 1}</text>${textBlock(item, cx + 22, cy + 101, 21, '#26364f', 700, 26, 25)}`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#ffffff"/><rect x="${x}" y="${y}" width="${w}" height="67" rx="28" fill="#eef3fb"/><circle cx="${x + 34}" cy="${y + 34}" r="8" fill="#e46565"/><circle cx="${x + 59}" cy="${y + 34}" r="8" fill="#f0bd4a"/><circle cx="${x + 84}" cy="${y + 34}" r="8" fill="#5bc98b"/><text x="${x + 125}" y="${y + 43}" fill="#61718a" font-family="Arial,sans-serif" font-size="20">Ápice Gestão · ${xml(scene.kicker)}</text><text x="${x + 39}" y="${y + 127}" fill="#152640" font-family="Arial,sans-serif" font-size="29" font-weight="700">${xml(scene.title)}</text>${cards}</svg>`);
}

await mkdir(framesDir, { recursive: true });
const manifest = [];
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  let frame;
  if (scene.mode === 'photo') {
    const photo = await sharp(path.join(root, scene.asset)).resize(W, H, { fit: 'cover' }).png().toBuffer();
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="m"><stop stop-color="#061731" stop-opacity=".92"/><stop offset=".58" stop-color="#061731" stop-opacity=".62"/><stop offset="1" stop-color="#061731" stop-opacity=".03"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#m)"/><text x="100" y="120" fill="#f3bc48" font-family="Arial,sans-serif" font-size="27" font-weight="700" letter-spacing="3">${xml(scene.kicker)}</text>${textBlock(scene.title, 100, 300, 66, '#ffffff', 800, 26, 80)}${scene.items.map((item,j)=>`<circle cx="115" cy="${418+j*90}" r="7" fill="#f3bc48"/>${textBlock(item,137,428+j*90,29,'#ffffff',500,37,35)}`).join('')}<text x="100" y="1015" fill="#ffffff" font-family="Arial,sans-serif" font-size="20">ILUSTRAÇÃO DO CONCEITO · NÃO É UMA INSTALAÇÃO REAL</text></svg>`);
    frame = await sharp(photo).composite([{ input: overlay, left: 0, top: 0 }]).png().toBuffer();
  } else {
    const overlays = [];
    if (scene.mode === 'phone') {
      const phone = await sharp(path.join(root, scene.asset)).resize({ height: 890 }).png().toBuffer();
      const m = await sharp(phone).metadata();
      const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${1407 - 17}" y="${95 - 18}" width="${m.width + 34}" height="${m.height + 36}" rx="40" fill="#05132a"/><rect x="${1407 - 7}" y="${95 - 8}" width="${m.width + 14}" height="${m.height + 16}" rx="29" fill="#ffffff"/></svg>`);
      overlays.push({ input: shadow, left: 0, top: 0 }, { input: phone, left: 1407, top: 95 });
    } else if (scene.mode === 'panel') overlays.push({ input: featurePanel(scene), left: 0, top: 0 });
    else if (scene.mode === 'screenshot') {
      const screenshotPath = path.join(root, scene.asset);
      try {
        await access(screenshotPath);
        // O recorte exclui o navegador, a saudação com o nome da conta e o avatar.
        const crop = await sharp(screenshotPath).extract({ left: 365, top: 348, width: 875, height: 660 }).png().toBuffer();
        const frameBorder = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="935" y="187" width="895" height="680" rx="20" fill="#ffffff"/><text x="951" y="898" fill="#96aac9" font-family="Arial,sans-serif" font-size="18">PAINEL GERENCIAL · CAPTURA DO SISTEMA</text></svg>`);
        overlays.push({ input: frameBorder, left: 0, top: 0 }, { input: crop, left: 945, top: 197 });
      } catch {
        console.warn('Captura do Dashboard ausente; usando painel ilustrativo.');
        overlays.push({ input: featurePanel(scene), left: 0, top: 0 });
      }
    }
    if (scene.mode === 'closing') {
      const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><circle cx="1480" cy="495" r="195" fill="#255bcd"/><path d="M1365 510c105-124 145-99 230-25M1390 557h210" fill="none" stroke="#f3bc48" stroke-width="36" stroke-linecap="round"/></svg>`);
      overlays.push({ input: mark, left: 0, top: 0 });
    }
    frame = await sharp(backdrop(scene, i)).composite(overlays).png().toBuffer();
  }
  const filename = `${String(i + 1).padStart(2, '0')}-${scene.key}.png`;
  await writeFile(path.join(framesDir, filename), frame);
  manifest.push({ index: i + 1, key: scene.key, filename, duration: durations[i], narration: paragraphs[i] });
  console.log(`Cena ${i + 1}/${scenes.length}: ${scene.key} (${durations[i].toFixed(1)}s)`);
}

let elapsed = 0;
for (const item of manifest) { item.start = elapsed; elapsed += item.duration; item.end = elapsed; }
await writeFile(path.join(root, 'cenas-publicitario.json'), JSON.stringify(manifest, null, 2));
const quote = s => `'${s.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
const concat = manifest.map(item => `file ${quote(path.join(framesDir, item.filename))}\nduration ${item.duration.toFixed(4)}`).join('\n') + `\nfile ${quote(path.join(framesDir, manifest.at(-1).filename))}\n`;
const concatPath = path.join(framesDir, 'lista.txt');
await writeFile(concatPath, concat);

await new Promise((resolve, reject) => {
  const p = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatPath, '-i', audio,
    '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', String(audioDuration), '-movflags', '+faststart', output], { stdio: 'inherit' });
  p.on('error', reject);
  p.on('exit', code => code === 0 ? resolve() : reject(new Error(`ffmpeg encerrou com código ${code}`)));
});

console.log(`Vídeo: ${output}`);
