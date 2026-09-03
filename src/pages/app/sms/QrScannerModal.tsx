import { useEffect, useRef, useState } from "react"

interface Props {
  onScan: (id: string) => void
  onClose: () => void
  hint?: string
  title?: string
  badgeMode?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function QrScannerModal({ onScan, onClose, hint: hintProp, title = "Escanear QR Code", badgeMode = false }: Props) {
  const [error, setError]   = useState<string | null>(null)
  const [hint, setHint]     = useState(hintProp ?? "Aponte a câmera para o QR Code")
  const [scanned, setScanned] = useState(false)   // feedback visual enquanto para a câmera
  const scannerRef          = useRef<any>(null)
  const doneRef             = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        const scanner = new Html5Qrcode("qr-reader-sms")
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },

          // ── Callback de sucesso ─────────────────────────────────────────
          async (decoded: string) => {
            if (doneRef.current || cancelled) return
            const id = decoded.trim()

            const badgeValido = /^APICE:1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
            if (badgeMode ? !badgeValido : !UUID_RE.test(id)) {
              setHint("QR inválido — use o QR gerado pelo sistema")
              return
            }

            // Marca como concluído imediatamente para ignorar frames seguintes
            doneRef.current = true
            setScanned(true)

            // Para a câmera ANTES de notificar o pai.
            // Isso evita que o cleanup do useEffect chame stop() duas vezes
            // (double-stop causa crash no Capacitor WebView → tela branca).
            try { await scanner.stop() } catch { /* já parado */ }
            scannerRef.current = null   // sinaliza ao cleanup que já foi parado

            if (!cancelled) onScan(id)
          },

          // ── Callback de frame sem QR (silencioso) ───────────────────────
          () => { /* ignore frame errors */ }
        )
      } catch (e: any) {
        if (cancelled) return
        setError(
          e?.message?.includes("permission")
            ? "Permissão de câmera negada. Libere o acesso nas configurações do celular."
            : "Não foi possível abrir a câmera."
        )
      }
    }

    start()

    // Cleanup: para a câmera somente se ainda estiver rodando
    return () => {
      cancelled = true
      const s = scannerRef.current
      if (s) {
        scannerRef.current = null
        s.stop().catch(() => {})
      }
    }
  // Sem dependência em onScan: a câmera inicia uma vez e não reinicia a cada render do pai
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-3 bg-black/80">
        <button onClick={onClose} className="text-white text-2xl leading-none px-1">‹</button>
        <h1 className="font-semibold text-white text-sm">{title}</h1>
      </div>

      {/* Camera area */}
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
          <span className="text-5xl">📷</span>
          <p className="text-white text-sm leading-relaxed">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-3 bg-white/20 text-white rounded-xl text-sm"
          >
            Fechar
          </button>
        </div>
      ) : scanned ? (
        // Feedback visual enquanto processa (transição antes de mostrar o histórico)
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
            <span className="text-3xl">✓</span>
          </div>
          <p className="text-white text-sm font-semibold">QR lido! Carregando...</p>
        </div>
      ) : (
        <>
          {/* html5-qrcode mounts camera here */}
          <div id="qr-reader-sms" className="flex-1 w-full" />

          {/* Overlay hint */}
          <div className="px-6 py-4 bg-black/80 text-center">
            <p className="text-white/80 text-xs">{hint}</p>
          </div>
        </>
      )}
    </div>
  )
}
