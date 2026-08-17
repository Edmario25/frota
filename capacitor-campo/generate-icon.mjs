/**
 * Gera o ícone do Apontador de Campo (1024x1024 PNG)
 * Design: scanner QR corners + silhueta de pessoa + badge verde com checkmark
 */
import { createCanvas } from "canvas"
import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, "assets")
mkdirSync(OUT_DIR, { recursive: true })

const S   = 1024
const c   = createCanvas(S, S)
const ctx = c.getContext("2d")

// ── helpers ──────────────────────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ── 1. Fundo com borda arredondada ────────────────────────────────────────────
const BG_RADIUS = S * 0.195   // ~200px arredondamento de ícone Android

// Sombra suave (opcional, para preview)
ctx.shadowColor = "rgba(0,0,0,0.5)"
ctx.shadowBlur  = 30
roundRect(0, 0, S, S, BG_RADIUS)
ctx.fillStyle = "#0f172a"
ctx.fill()
ctx.shadowBlur = 0

// Gradiente radial de fundo: azul-noite no centro
const bgGrad = ctx.createRadialGradient(S * 0.4, S * 0.35, 0, S * 0.5, S * 0.5, S * 0.72)
bgGrad.addColorStop(0, "#1e3a5f")
bgGrad.addColorStop(1, "#0f172a")
roundRect(0, 0, S, S, BG_RADIUS)
ctx.fillStyle = bgGrad
ctx.fill()

// ── 2. Brilho central (halo azul suave) ──────────────────────────────────────
const halo = ctx.createRadialGradient(S * 0.5, S * 0.48, 0, S * 0.5, S * 0.48, S * 0.38)
halo.addColorStop(0, "rgba(59,130,246,0.20)")
halo.addColorStop(1, "rgba(59,130,246,0.00)")
roundRect(0, 0, S, S, BG_RADIUS)
ctx.fillStyle = halo
ctx.fill()

// ── 3. Cantos do scanner QR ───────────────────────────────────────────────────
const cx  = S / 2
const cy  = S * 0.45
const ARM = S * 0.105    // comprimento de cada braço
const GAP = S * 0.225    // metade do espaço do quadrado
const R   = S * 0.045    // raio do canto interno
const LW  = S * 0.038    // espessura da linha

ctx.strokeStyle = "#3b82f6"
ctx.lineWidth   = LW
ctx.lineCap     = "round"
ctx.lineJoin    = "round"

const corners = [
  // [startX, startY, cornerX, cornerY, endX, endY]
  [cx - GAP, cy - GAP + ARM, cx - GAP, cy - GAP, cx - GAP + ARM, cy - GAP],  // topo-esq
  [cx + GAP - ARM, cy - GAP, cx + GAP, cy - GAP, cx + GAP, cy - GAP + ARM],  // topo-dir
  [cx - GAP, cy + GAP - ARM, cx - GAP, cy + GAP, cx - GAP + ARM, cy + GAP],  // base-esq
  [cx + GAP - ARM, cy + GAP, cx + GAP, cy + GAP, cx + GAP, cy + GAP - ARM],  // base-dir
]

for (const [x1, y1, mx, my, x2, y2] of corners) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(mx, my, x2, y2)
  ctx.stroke()
}

// ── 4. Silhueta de pessoa ─────────────────────────────────────────────────────
ctx.fillStyle = "#e2e8f0"

// Cabeça
const headR = S * 0.112
const headY = cy - S * 0.055
ctx.beginPath()
ctx.arc(cx, headY, headR, 0, Math.PI * 2)
ctx.fill()

// Corpo (arco inferior)
const bodyW  = S * 0.37
const bodyY  = headY + headR + S * 0.02
const bodyH  = S * 0.185
ctx.beginPath()
ctx.moveTo(cx - bodyW / 2, bodyY + bodyH)
ctx.bezierCurveTo(
  cx - bodyW / 2, bodyY,
  cx - bodyW * 0.08, bodyY,
  cx, bodyY
)
ctx.bezierCurveTo(
  cx + bodyW * 0.08, bodyY,
  cx + bodyW / 2, bodyY,
  cx + bodyW / 2, bodyY + bodyH
)
ctx.closePath()
ctx.fill()

// ── 5. Badge verde com checkmark ─────────────────────────────────────────────
const bx  = cx + GAP * 0.72    // centro do badge
const by  = cy + GAP * 0.72
const br  = S * 0.118           // raio externo

// Círculo escuro (anel separador do fundo)
ctx.beginPath()
ctx.arc(bx, by, br + S * 0.018, 0, Math.PI * 2)
ctx.fillStyle = "#0f172a"
ctx.fill()

// Círculo verde externo
ctx.beginPath()
ctx.arc(bx, by, br, 0, Math.PI * 2)
ctx.fillStyle = "#15803d"
ctx.fill()

// Círculo verde interno (mais claro)
ctx.beginPath()
ctx.arc(bx, by, br * 0.84, 0, Math.PI * 2)
ctx.fillStyle = "#16a34a"
ctx.fill()

// Checkmark branco
const ck = br * 0.52
ctx.strokeStyle = "#ffffff"
ctx.lineWidth   = S * 0.032
ctx.lineCap     = "round"
ctx.lineJoin    = "round"
ctx.beginPath()
ctx.moveTo(bx - ck * 0.55, by + ck * 0.05)
ctx.lineTo(bx - ck * 0.05, by + ck * 0.58)
ctx.lineTo(bx + ck * 0.65, by - ck * 0.52)
ctx.stroke()

// ── 6. Salvar ─────────────────────────────────────────────────────────────────
const buf = c.toBuffer("image/png")
writeFileSync(join(OUT_DIR, "icon.png"), buf)

// foreground.png para Capacitor Assets (transparente + ícone centralizado)
const fc   = createCanvas(S, S)
const fctx = fc.getContext("2d")
// Sem fundo (transparente), só o conteúdo centralizado menor
fctx.drawImage(c, S * 0.1, S * 0.1, S * 0.8, S * 0.8)
writeFileSync(join(OUT_DIR, "icon-foreground.png"), fc.toBuffer("image/png"))

console.log("✅ assets/icon.png          (1024×1024 — ícone completo)")
console.log("✅ assets/icon-foreground.png (1024×1024 — foreground adaptável)")
