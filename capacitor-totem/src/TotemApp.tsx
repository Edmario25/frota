import { useEffect, useState } from "react"
import { supabase, TOTEM_EMAIL, TOTEM_SENHA } from "./supabaseClient"
import { TotemScreen } from "./TotemScreen"

type Fase = "login" | "ok" | "erro"

// ─── App raiz do totem ────────────────────────────────────────────────────────
// Faz login automático com a conta de serviço e exibe o TotemScreen.
// Não há tela de seleção de obra — o obraId pode ser fixado via env ou
// deixado como null (o técnico de SMS registra o totem na obra correta).
export function TotemApp() {
  const [fase,     setFase]     = useState<Fase>("login")
  const [erroMsg,  setErroMsg]  = useState("")
  const [scanId,   setScanId]   = useState<string | null>(null)  // id do "operador" (conta totem)

  const OBRA_ID = import.meta.env.VITE_OBRA_ID ?? null  // fixe no .env se necessário

  // ── Auto-login na montagem ──────────────────────────────────────────────────
  useEffect(() => {
    async function login() {
      // Verifica se já tem sessão ativa (reboot do tablet)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setScanId(session.user.id)
        setFase("ok")
        return
      }

      if (!TOTEM_SENHA) {
        setErroMsg("Configure VITE_TOTEM_SENHA no arquivo .env antes de gerar o APK.")
        setFase("erro")
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email:    TOTEM_EMAIL,
        password: TOTEM_SENHA,
      })

      if (error || !data.session) {
        setErroMsg(error?.message ?? "Falha na autenticação do totem")
        setFase("erro")
        return
      }

      setScanId(data.session.user.id)
      setFase("ok")
    }

    login()
  }, [])

  // ── Tela de loading ─────────────────────────────────────────────────────────
  if (fase === "login") {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: "#030712",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <div style={{
          width: 56, height: 56,
          borderRadius: "50%",
          border: "4px solid #22c55e",
          borderTopColor: "transparent",
        }} className="animate-spin" />
        <p style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500 }}>
          Conectando ao sistema...
        </p>
      </div>
    )
  }

  // ── Tela de erro de autenticação ────────────────────────────────────────────
  if (fase === "erro") {
    return (
      <div style={{
        width: "100%", height: "100%",
        background: "#030712",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16, padding: 32, textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "#7f1d1d",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>⚠</div>
        <p style={{ color: "#f87171", fontSize: 16, fontWeight: 600 }}>
          Erro de configuração
        </p>
        <p style={{ color: "#6b7280", fontSize: 13, maxWidth: 300 }}>
          {erroMsg}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            background: "#374151",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // ── Totem ativo ─────────────────────────────────────────────────────────────
  return (
    <TotemScreen
      obraId={OBRA_ID}
      registradoPor={scanId ?? "totem"}
    />
  )
}
