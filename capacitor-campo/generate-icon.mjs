/**
 * Gera o ícone do Apontador de Campo (1024x1024 PNG) usando Canvas API do Node.
 * Executa: node generate-icon.mjs
 */
import { createCanvas } from "canvas"
import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, "assets")
mkdirSync(OUT_DIR, { recursive: true })

const SIZE = 1024
const c    = createCanvas(SIZE, SIZE)
const ctx  = c.getContext("2d")

// ── Fundo gradiente slate escuro ──────────────────────────────────────────────
const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE)
grad.addColorStop(0, "#1e293b")   // slate-800
grad.addColorStop(1, "#0f172a")   // slate-900
ctx.fillStyle = grad
ctx.beginPath()
if (ctx.roundRect) ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.18)
else ctx.rect(0, 0, SIZE, SIZE)
ctx.fill()

// ── Círculo suave de fundo ────────────────────────────────────────────────────
ctx.fillStyle = "rgba(59,130,246,0.12)"   // blue-500 suave
ctx.beginPath()
ctx.arc(SIZE / 2, SIZE / 2 - SIZE * 0.04, SIZE * 0.42, 0, Math.PI * 2)
ctx.fill()

// ── Ícone de prancheta / clipboard ───────────────────────────────────────────
const cx   = SIZE / 2
const cy   = SIZE * 0.44
const bw   = SIZE * 0.44    // largura da prancheta
const bh   = SIZE * 0.52    // altura da prancheta
const bx   = cx - bw / 2
const by   = cy - bh / 2 + SIZE * 0.04
const br   = SIZE * 0.045   // border-radius

// Corpo da prancheta (branco)
ctx.fillStyle = "#f1f5f9"   // slate-100
ctx.beginPath()
ctx.roundRect(bx, by, bw, bh, br)
ctx.fill()

// Clip superior (parte que prende o papel)
const cw  = bw * 0.40
const ch  = SIZE * 0.07
const cx2 = cx - cw / 2
const cy2 = by - ch * 0.55
ctx.fillStyle = "#3b82f6"   // blue-500
ctx.beginPath()
ctx.roundRect(cx2, cy2, cw, ch, SIZE * 0.02)
ctx.fill()

// Buraco do clip (elipse branca)
ctx.fillStyle = "#1e293b"
ctx.beginPath()
ctx.ellipse(cx, cy2 + ch * 0.5, SIZE * 0.045, SIZE * 0.025, 0, 0, Math.PI * 2)
ctx.fill()

// ── Linhas de texto simuladas ─────────────────────────────────────────────────
const lineColor = "#94a3b8"   // slate-400
const lineX     = bx + SIZE * 0.06
const lineW     = bw - SIZE * 0.12
const lineH     = SIZE * 0.022
const lineR     = SIZE * 0.011
const startY    = by + SIZE * 0.11

const lines = [0.85, 1, 0.7, 1, 0.6]  // larguras relativas das linhas
lines.forEach((rel, i) => {
  ctx.fillStyle = i === 0 ? "#3b82f6" : lineColor
  ctx.beginPath()
  ctx.roundRect(lineX, startY + i * SIZE * 0.075, lineW * rel, lineH, lineR)
  ctx.fill()
})

// ── Check mark (✓) no canto inferior direito da prancheta ────────────────────
const ckSize = SIZE * 0.13
const ckX    = bx + bw - ckSize - SIZE * 0.04
const ckY    = by + bh - ckSize - SIZE * 0.04

// Círculo verde
ctx.fillStyle = "#22c55e"   // green-500
ctx.beginPath()
ctx.arc(ckX + ckSize / 2, ckY + ckSize / 2, ckSize / 2, 0, Math.PI * 2)
ctx.fill()

// Checkmark branco
ctx.strokeStyle = "#ffffff"
ctx.lineWidth   = SIZE * 0.022
ctx.lineCap     = "round"
ctx.lineJoin    = "round"
ctx.beginPath()
ctx.moveTo(ckX + ckSize * 0.22, ckY + ckSize * 0.52)
ctx.lineTo(ckX + ckSize * 0.44, ckY + ckSize * 0.72)
ctx.lineTo(ckX + ckSize * 0.78, ckY + ckSize * 0.28)
ctx.stroke()

// ── Texto "ÁPICE" na parte inferior ──────────────────────────────────────────
ctx.fillStyle    = "#64748b"   // slate-500
ctx.font         = `bold ${SIZE * 0.055}px Arial`
ctx.textAlign    = "center"
ctx.textBaseline = "alphabetic"
ctx.fillText("ÁPICE GESTÃO", SIZE / 2, SIZE * 0.935)

// Salva
const buf = c.toBuffer("image/png")
writeFileSync(join(OUT_DIR, "icon.png"), buf)
console.log("✅ assets/icon.png gerado (1024×1024)")
