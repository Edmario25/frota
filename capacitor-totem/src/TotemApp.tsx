import { TotemScreen } from "./TotemScreen"

const OBRA_ID = import.meta.env.VITE_OBRA_ID || null   // "" vira null

// ─── App raiz do totem ────────────────────────────────────────────────────────
// Usa somente a chave pública e uma RPC limitada no banco.
export function TotemApp() {

  // Service key não configurada no build
  if (!OBRA_ID) {
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
        <p style={{ color: "#6b7280", fontSize: 13, maxWidth: 320 }}>
          Configure VITE_OBRA_ID no arquivo .env antes de gerar o APK.
        </p>
      </div>
    )
  }

  return (
    <TotemScreen
      obraId={OBRA_ID}
      registradoPor="totem"
    />
  )
}
