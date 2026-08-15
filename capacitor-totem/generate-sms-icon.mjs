/**
 * Gera ícones PNG para o PWA do SMS Campo.
 * Executa: node generate-sms-icon.mjs
 * Saída: ../public/sms-192x192.png e ../public/sms-512x512.png
 */
import { createCanvas } from "canvas"
import { writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC    = join(__dirname, "..", "public")

function drawIcon(size) {
  const c   = createCanvas(size, size)
  const ctx = c.getContext("2d")
  const R   = size * 0.18   // border radius

  // ── Fundo verde escuro ──────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, size, size)
  bg.addColorStop(0,   "#166534")   // green-800
  bg.addColorStop(0.6, "#15803d")   // green-700
  bg.addColorStop(1,   "#16a34a")   // green-600
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, R)
  ctx.fill()

  // ── Brilho sutil no topo ────────────────────────────────────────────────────
  const shine = ctx.createRadialGradient(size * 0.5, size * 0.1, 0, size * 0.5, size * 0.1, size * 0.65)
  shine.addColorStop(0,   "rgba(255,255,255,0.12)")
  shine.addColorStop(1,   "rgba(255,255,255,0)")
  ctx.fillStyle = shine
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, R)
  ctx.fill()

  // ── Círculo de fundo para o capacete ───────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.08)"
  ctx.beginPath()
  ctx.arc(size * 0.5, size * 0.44, size * 0.36, 0, Math.PI * 2)
  ctx.fill()

  // ── Capacete de segurança (desenhado vetorialmente) ─────────────────────────
  const hx = size * 0.5    // centro X
  const hy = size * 0.38   // centro Y
  const hw = size * 0.52   // largura
  const hh = size * 0.32   // altura cúpula

  // Cúpula do capacete
  const helmetGrad = ctx.createLinearGradient(hx - hw/2, hy - hh, hx + hw/2, hy)
  helmetGrad.addColorStop(0,   "#fde68a")   // amarelo claro
  helmetGrad.addColorStop(0.5, "#fbbf24")   // âmbar
  helmetGrad.addColorStop(1,   "#d97706")   // âmbar escuro
  ctx.fillStyle = helmetGrad
  ctx.beginPath()
  ctx.ellipse(hx, hy, hw / 2, hh * 0.95, 0, Math.PI, 0, true)
  ctx.closePath()
  ctx.fill()

  // Aba do capacete
  const brimY = hy + size * 0.01
  const brimH = size * 0.065
  ctx.fillStyle = "#f59e0b"
  ctx.beginPath()
  ctx.roundRect(hx - hw * 0.58, brimY, hw * 1.16, brimH, brimH / 2)
  ctx.fill()

  // Friso interno do capacete
  ctx.fillStyle = "rgba(254,243,199,0.40)"
  ctx.beginPath()
  ctx.roundRect(hx - hw * 0.38, brimY + brimH * 0.15, hw * 0.76, brimH * 0.5, brimH * 0.25)
  ctx.fill()

  // Brilho cúpula
  ctx.fillStyle = "rgba(255,255,255,0.20)"
  ctx.beginPath()
  ctx.ellipse(hx - hw * 0.12, hy - hh * 0.55, hw * 0.18, hh * 0.22, -0.4, 0, Math.PI * 2)
  ctx.fill()

  // ── Símbolo SMS / escudo ────────────────────────────────────────────────────
  // Três linhas representando documentação / relatório SMS
  const lx  = size * 0.28
  const ly  = size * 0.625
  const lw  = size * 0.44
  const lh  = size * 0.032
  const gap = size * 0.058

  ctx.fillStyle = "rgba(255,255,255,0.90)"
  for (let i = 0; i < 3; i++) {
    const w = i === 2 ? lw * 0.65 : lw
    ctx.beginPath()
    ctx.roundRect(lx, ly + i * (lh + gap), w, lh, lh / 2)
    ctx.fill()
  }

  // ── Texto "SMS" ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.font      = `900 ${size * 0.13}px Arial, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("SMS", size * 0.5, size * 0.88)

  // ── Texto "Campo" menor ─────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(209,250,229,0.80)"
  ctx.font      = `600 ${size * 0.065}px Arial, sans-serif`
  ctx.fillText("CAMPO", size * 0.5, size * 0.955)

  return c
}

for (const sz of [192, 512]) {
  const canvas = drawIcon(sz)
  const buf    = canvas.toBuffer("image/png")
  const file   = join(PUBLIC, `sms-${sz}x${sz}.png`)
  writeFileSync(file, buf)
  console.log(`✅ public/sms-${sz}x${sz}.png gerado (${sz}×${sz})`)
}
