/**
 * Gera o ícone fonte do totem (1024x1024 PNG) usando Canvas API do Node.
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

// ── Fundo gradiente escuro ────────────────────────────────────────────────────
const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
grad.addColorStop(0, "#1e3a5f")
grad.addColorStop(1, "#0f172a")
ctx.fillStyle = grad
ctx.beginPath()
ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.18)
ctx.fill()

// ── Círculo de fundo para o QR ───────────────────────────────────────────────
ctx.fillStyle = "rgba(255,255,255,0.08)"
ctx.beginPath()
ctx.arc(SIZE / 2, SIZE / 2, SIZE * 0.38, 0, Math.PI * 2)
ctx.fill()

// ── Desenha QR code simplificado (ícone) ─────────────────────────────────────
ctx.fillStyle = "#ffffff"
ctx.strokeStyle = "#ffffff"

const qx  = SIZE * 0.22   // x origem
const qy  = SIZE * 0.22   // y origem
const qsz = SIZE * 0.56   // tamanho total do QR
const cell = qsz / 7      // 7×7 grid

function fillCell(col, row) {
  ctx.fillRect(qx + col * cell + 2, qy + row * cell + 2, cell - 4, cell - 4)
}

// Padrão QR simplificado (finder patterns)
// Canto superior esquerdo
for (let r = 0; r < 7; r++) for (let co = 0; co < 7; co++) {
  if (r === 0 || r === 6 || co === 0 || co === 6 || (r >= 2 && r <= 4 && co >= 2 && co <= 4))
    fillCell(co, r)
}
// Canto superior direito
for (let r = 0; r < 7; r++) for (let co = 0; co < 7; co++) {
  if (r === 0 || r === 6 || co === 0 || co === 6 || (r >= 2 && r <= 4 && co >= 2 && co <= 4))
    fillCell(co + (7 - 0), r)  // offset não usado — reescrito abaixo
}

// Limpa e redesenha de forma mais controlada
ctx.clearRect(0, 0, SIZE, SIZE)

// Fundo
const g2 = ctx.createLinearGradient(0, 0, 0, SIZE)
g2.addColorStop(0, "#1e3a5f")
g2.addColorStop(1, "#0f172a")
ctx.fillStyle = g2
ctx.beginPath()
if (ctx.roundRect) ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.18)
else ctx.rect(0, 0, SIZE, SIZE)
ctx.fill()

// Círculo suave
ctx.fillStyle = "rgba(255,255,255,0.07)"
ctx.beginPath()
ctx.arc(SIZE / 2, SIZE / 2 - SIZE * 0.04, SIZE * 0.40, 0, Math.PI * 2)
ctx.fill()

// Emoji/ícone: prédio (construção) usando texto
ctx.fillStyle = "#fbbf24"   // amarelo âmbar
ctx.font      = `bold ${SIZE * 0.30}px Arial`
ctx.textAlign = "center"
ctx.textBaseline = "middle"
ctx.fillText("🏗", SIZE / 2, SIZE * 0.38)

// QR symbol pequeno abaixo
ctx.fillStyle = "rgba(255,255,255,0.90)"
const qs  = SIZE * 0.30
const qox = (SIZE - qs) / 2
const qoy = SIZE * 0.58
const cs  = qs / 5

const qrPattern = [
  [1,1,1,0,1,1,1],
  [1,0,1,0,1,0,1],
  [1,1,1,0,1,1,1],
  [0,0,0,0,0,0,0],
  [1,1,1,0,1,0,0],
  [1,0,0,0,0,1,0],
  [1,1,1,0,0,0,1],
]
const csm = qs / 7
qrPattern.forEach((row, ri) => {
  row.forEach((bit, ci) => {
    if (bit) {
      const pad = 1.5
      ctx.fillRect(qox + ci * csm + pad, qoy + ri * csm + pad, csm - pad*2, csm - pad*2)
    }
  })
})

// Texto "ÁPICE" na parte inferior
ctx.fillStyle = "#94a3b8"
ctx.font      = `bold ${SIZE * 0.055}px Arial`
ctx.textAlign = "center"
ctx.textBaseline = "alphabetic"
ctx.fillText("ÁPICE GESTÃO", SIZE / 2, SIZE * 0.935)

// Salva
const buf = c.toBuffer("image/png")
writeFileSync(join(OUT_DIR, "icon.png"), buf)
console.log("✅ assets/icon.png gerado (1024×1024)")
