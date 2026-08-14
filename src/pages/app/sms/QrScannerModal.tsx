import { useEffect, useRef, useState } from "react"

interface Props {
  onScan: (id: string) => void
  onClose: () => void
  hint?: string
  title?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function QrScannerModal({ onScan, onClose, hint: hintProp, title = "Escanear QR Code" }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint]   = useState(hintProp ?? "Aponte a câmera para o QR Code")
  const stopRef           = useRef<(() => void) | null>(null)
  const doneRef           = useRef(false)

  useEffect(() => {
    let scanner: any = null

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        scanner = new Html5Qrcode("qr-reader-sms")

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded: string) => {
            if (doneRef.current) return
            const id = decoded.trim()
            if (!UUID_RE.test(id)) {
              setHint("QR inválido — use o QR gerado pelo sistema")
              return
            }
            doneRef.current = true
            scanner.stop().catch(() => {})
            onScan(id)
          },
          () => {/* ignore frame errors */}
        )

        stopRef.current = () => scanner.stop().catch(() => {})
      } catch (e: any) {
        setError(
          e?.message?.includes("permission")
            ? "Permissão de câmera negada. Libere o acesso nas configurações do celular."
            : "Não foi possível abrir a câmera."
        )
      }
    }

    start()

    return () => {
      if (stopRef.current) stopRef.current()
    }
  }, [onScan])

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
