import { useEffect, useRef, useState, useCallback } from "react"
import { supabase } from "./supabaseClient"

// ─── Types ────────────────────────────────────────────────────────────────────
type Estado = "scanning" | "loading" | "confirmado" | "erro"

interface DadosConfirmacao {
  nome:     string
  foto_url: string | null
  tipo:     "entrada" | "saida"
  hora:     string
  cargo:    string
}

interface Props {
  obraId:        string | null
  registradoPor: string
}

const UUID_RE  = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const RESET_MS = 4500    // ms antes de voltar ao scan após confirmação
const ERRO_MS  = 3000    // ms antes de voltar ao scan após erro

// ─── TotemScreen ─────────────────────────────────────────────────────────────
export function TotemScreen({ obraId, registradoPor }: Props) {
  const [estado,      setEstado]      = useState<Estado>("scanning")
  const [confirmacao, setConfirmacao] = useState<DadosConfirmacao | null>(null)
  const [erroMsg,     setErroMsg]     = useState("")
  const [hora,        setHora]        = useState(agora())

  const scannerRef  = useRef<any>(null)
  const doneRef     = useRef(false)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef  = useRef(true)

  // Relógio no header — atualiza a cada 30 s
  useEffect(() => {
    const iv = setInterval(() => setHora(agora()), 30_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Scanner ──────────────────────────────────────────────────────────────────
  const pararScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch { /* ok */ }
      try { scannerRef.current.clear() }    catch { /* ok */ }
      scannerRef.current = null
    }
  }, [])

  const iniciarScanner = useCallback(async () => {
    if (!mountedRef.current) return
    doneRef.current = false

    try {
      const { Html5Qrcode } = await import("html5-qrcode")

      // Garante que o div receptor está limpo
      await pararScanner()

      const scanner = new Html5Qrcode("totem-reader")
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded: string) => {
          if (doneRef.current || !mountedRef.current) return
          // Remove todo whitespace (incluindo \r \n \t e caracteres invisíveis)
          const limpo = decoded.replace(/\s+/g, "").replace(/[^\x20-\x7E]/g, "")
          const match = limpo.match(UUID_RE)
          // Debug: mostra o que foi lido (remover depois de confirmar funcionamento)
          if (!match) {
            mostrarErro(`QR lido mas sem UUID: "${limpo.slice(0, 40)}"`)
            return
          }
          const id = match[0].toLowerCase()
          // Valida formato exato antes de enviar ao banco
          const uuidExato = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
          if (!uuidExato) {
            mostrarErro(`Formato inválido: "${id}"`)
            return
          }
          doneRef.current = true
          await pararScanner()
          if (mountedRef.current) {
            setEstado("loading")
            await processarPonto(id)
          }
        },
        () => {}  // onError — ignora frames sem QR
      )
    } catch (e: any) {
      if (!mountedRef.current) return
      mostrarErro("Câmera indisponível — verifique permissões")
    }
  }, [pararScanner])

  useEffect(() => {
    iniciarScanner()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      pararScanner()
    }
  }, [iniciarScanner, pararScanner])

  // ── Processar ponto ──────────────────────────────────────────────────────────
  async function processarPonto(employeeId: string) {
    try {
      if (!obraId) throw new Error("Totem sem obra configurada")
      const { data, error } = await (supabase as any).rpc("registrar_ponto_totem", {
        p_employee_id: employeeId,
        p_obra_id: obraId,
      })
      if (error) throw error

      // 4. Mostra confirmação
      if (!mountedRef.current) return
      setConfirmacao({
        nome:     data.nome,
        foto_url: data.foto_url ?? null,
        tipo:     data.tipo,
        hora:     new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        cargo:    data.cargo ?? "",
      })
      setEstado("confirmado")
      reiniciarApos(RESET_MS)

    } catch (e: any) {
      mostrarErro(e?.message ?? "Erro ao registrar ponto")
    }
  }

  function mostrarErro(msg: string) {
    if (!mountedRef.current) return
    setErroMsg(msg)
    setEstado("erro")
    reiniciarApos(ERRO_MS)
  }

  function reiniciarApos(ms: number) {
    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      setConfirmacao(null)
      setErroMsg("")
      setEstado("scanning")
      await iniciarScanner()
    }, ms)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#030712",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "36px 20px 12px",
        background: "rgba(0,0,0,0.6)",
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{
            color: "#fff",
            fontWeight: 900,
            fontSize: 15,
            letterSpacing: 1,
            margin: 0,
          }}>
            🏗️ ÁPICE GESTÃO
          </p>
          <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
            Registro de Ponto — {hora}
          </p>
        </div>
      </div>

      {/* ── Área da câmera ── */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

        {/* html5-qrcode monta o vídeo aqui */}
        <div
          id="totem-reader"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

        {/* ── Hint de scanning ── */}
        {estado === "scanning" && (
          <div style={{
            position: "absolute", bottom: 24,
            left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
            pointerEvents: "none",
            zIndex: 20,
          }}>
            <div style={{
              background: "rgba(0,0,0,0.65)",
              borderRadius: 18,
              padding: "12px 28px",
              textAlign: "center",
            }}>
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 600, margin: 0 }}>
                Apresente o QR Code do crachá
              </p>
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0 0" }}>
                O ponto será registrado automaticamente
              </p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {estado === "loading" && (
          <Overlay bg="rgba(3,7,18,0.96)">
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              border: "4px solid #22c55e",
              borderTopColor: "transparent",
            }} className="animate-spin" />
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginTop: 20 }}>
              Registrando ponto...
            </p>
          </Overlay>
        )}

        {/* ── Erro ── */}
        {estado === "erro" && (
          <Overlay bg="rgba(69,10,10,0.97)">
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#b91c1c",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, color: "#fff", fontWeight: 900,
            }} className="pop-in">✕</div>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 600, textAlign: "center", padding: "0 24px", marginTop: 16 }}>
              {erroMsg}
            </p>
            <p style={{ color: "#fca5a5", fontSize: 12, marginTop: 8 }}>
              Reiniciando em instantes...
            </p>
          </Overlay>
        )}

        {/* ── Confirmação ── */}
        {estado === "confirmado" && confirmacao && (
          <ConfirmacaoOverlay dados={confirmacao} />
        )}
      </div>
    </div>
  )
}

// ─── Overlay genérico ─────────────────────────────────────────────────────────
function Overlay({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      zIndex: 30,
    }}>
      {children}
    </div>
  )
}

// ─── Tela de Confirmação ──────────────────────────────────────────────────────
function ConfirmacaoOverlay({ dados }: { dados: DadosConfirmacao }) {
  const isEntrada = dados.tipo === "entrada"
  const cor       = isEntrada ? "#15803d" : "#1d4ed8"   // green-700 / blue-700
  const corBg     = isEntrada ? "rgba(5,46,22,0.97)"    : "rgba(23,37,84,0.97)"
  const label     = isEntrada ? "ENTRADA"                : "SAÍDA"
  const iniciais  = dados.nome.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
  const primeiroNome = dados.nome.split(" ").slice(0, 2).join(" ")

  return (
    <div className="slide-up" style={{
      position: "absolute", inset: 0,
      background: corBg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 12, zIndex: 30, padding: "0 16px",
    }}>

      {/* Check */}
      <div className="pop-in" style={{
        width: 64, height: 64, borderRadius: "50%",
        background: cor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, color: "#fff", fontWeight: 900,
        boxShadow: `0 0 32px ${cor}88`,
      }}>✓</div>

      {/* Foto ou iniciais */}
      <div style={{ marginTop: 4 }}>
        {dados.foto_url ? (
          <img
            src={dados.foto_url}
            alt=""
            style={{
              width: 96, height: 96, borderRadius: "50%",
              objectFit: "cover",
              border: "3px solid rgba(255,255,255,0.2)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          />
        ) : (
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: cor,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 28, fontWeight: 900,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            {iniciais}
          </div>
        )}
      </div>

      {/* Nome */}
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#fff", fontSize: 22, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
          {primeiroNome}
        </p>
        {dados.cargo && (
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>
            {dados.cargo}
          </p>
        )}
      </div>

      {/* Pill entrada/saída */}
      <div style={{
        background: cor,
        borderRadius: 20, padding: "10px 40px",
        boxShadow: `0 4px 24px ${cor}66`,
      }}>
        <p style={{
          color: "#fff", fontSize: 26, fontWeight: 900,
          letterSpacing: 4, margin: 0, textAlign: "center",
        }}>
          {label}
        </p>
      </div>

      {/* Hora */}
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 700 }}>
        {dados.hora}
      </p>

      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 8 }}>
        Aguardando próximo crachá...
      </p>
    </div>
  )
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function agora() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
