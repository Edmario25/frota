import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Printer, Download, X } from "lucide-react"

interface Vehicle {
  id: string
  placa: string
  marca: string
  modelo: string
  ano: number | null
}

interface Props {
  vehicle: Vehicle | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QrCodeVeiculoDialog({ vehicle, open, onOpenChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dataUrl, setDataUrl] = useState<string>("")

  useEffect(() => {
    if (!open || !vehicle) return

    let cancelled = false

    async function generate() {
      try {
        const QRCode = (await import("qrcode")).default
        const url = await QRCode.toDataURL(vehicle!.id, {
          width: 400,
          margin: 2,
          color: { dark: "#111827", light: "#FFFFFF" },
          errorCorrectionLevel: "M",
        })
        if (!cancelled) setDataUrl(url)
      } catch (err) {
        console.error("Erro ao gerar QR Code:", err)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [open, vehicle])

  if (!vehicle) return null

  const handlePrint = () => {
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code — ${vehicle.placa}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            h2 { margin: 0 0 4px; font-size: 22px; }
            p { margin: 2px 0; color: #555; font-size: 14px; }
            img { margin: 20px auto; display: block; width: 280px; height: 280px; }
            .footer { margin-top: 16px; font-size: 11px; color: #999; }
          </style>
        </head>
        <body>
          <h2>${vehicle.placa}</h2>
          <p>${vehicle.marca} ${vehicle.modelo}${vehicle.ano ? ` · ${vehicle.ano}` : ""}</p>
          <img src="${dataUrl}" alt="QR Code" />
          <p class="footer">Escaneie com o App SMS Campo para ver o histórico de segurança deste veículo</p>
          <script>window.onload = () => { window.print(); window.close() }<\/script>
        </body>
      </html>
    `)
    win.document.close()
  }

  const handleDownload = () => {
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `qr-${vehicle.placa.replace(/[^a-zA-Z0-9]/g, "")}.png`
    a.click()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>QR Code do Veículo</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Vehicle info */}
          <div className="text-center">
            <p className="text-2xl font-extrabold tracking-widest text-foreground">{vehicle.placa}</p>
            <p className="text-sm text-muted-foreground">
              {vehicle.marca} {vehicle.modelo}{vehicle.ano ? ` · ${vehicle.ano}` : ""}
            </p>
          </div>

          {/* QR Code */}
          <div className="border-2 border-gray-200 rounded-xl p-3 bg-white">
            {dataUrl ? (
              <img src={dataUrl} alt="QR Code" className="w-56 h-56" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Instruction */}
          <p className="text-xs text-center text-muted-foreground max-w-[220px]">
            Cole este QR no veículo. O técnico escaneia no App SMS Campo para ver o histórico.
          </p>

          {/* Actions */}
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
              disabled={!dataUrl}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Baixar
            </Button>
            <Button
              className="flex-1 bg-green-700 hover:bg-green-800"
              onClick={handlePrint}
              disabled={!dataUrl}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
