import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Printer, Download, QrCode, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmployeeLite {
  id: string
  nome: string
  cpf?: string
  foto_url?: string | null
  data_admissao?: string | null
  cargos?: { nome: string } | null
  departamentos?: { nome: string } | null
}

interface Treinamento {
  nome: string
  status: "em_dia" | "a_vencer" | "vencido" | "pendente"
  data_vencimento: string | null
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  employee: EmployeeLite
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const trStatusStyle: Record<string, { label: string; cls: string }> = {
  em_dia:   { label: "Em dia",   cls: "bg-green-100 text-green-800" },
  a_vencer: { label: "A vencer", cls: "bg-amber-100 text-amber-800" },
  vencido:  { label: "Vencido",  cls: "bg-red-100 text-red-800" },
  pendente: { label: "Pendente", cls: "bg-slate-100 text-slate-600" },
}

function trIcone(status: string) {
  if (status === "em_dia")   return <CheckCircle2 className="h-3 w-3 text-green-600" />
  if (status === "a_vencer") return <Clock className="h-3 w-3 text-amber-600" />
  return <AlertTriangle className="h-3 w-3 text-red-600" />
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CrachaFuncionarioDialog({ open, onOpenChange, employee }: Props) {
  const { toast } = useToast()
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [treinamentos, setTrein]  = useState<Treinamento[]>([])
  const [obraAtual, setObraAtual] = useState<string>("")
  const [empresa, setEmpresa]     = useState<string>("Ápice Gestão")
  const [fotoB64, setFotoB64]     = useState<string>("")   // base64 para embed no HTML
  const [loading, setLoading]     = useState(false)
  const [activeTab, setActiveTab] = useState<"frente" | "verso">("frente")

  useEffect(() => {
    if (open && employee) {
      setLoading(true)
      setFotoB64("")
      Promise.all([
        gerarQr(),
        fetchTreinamentos(),
        fetchObraAtual(),
        fetchEmpresa(),
        carregarFoto(),
      ]).finally(() => setLoading(false))
    }
  }, [open, employee.id])

  // ── Data fetching ─────────────────────────────────────────────────────────

  const gerarQr = async () => {
    try {
      const QRCode = (await import("qrcode")).default
      const url = await QRCode.toDataURL(employee.id, {
        width: 500, margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "H",
      })
      setQrDataUrl(url)
    } catch { /* ignore */ }
  }

  const fetchTreinamentos = async () => {
    const { data } = await (supabase as any)
      .from("sms_colaborador_treinamentos")
      .select("status, data_vencimento, sms_treinamentos_catalogo(nome)")
      .eq("colaborador_id", employee.id)
      .order("status")
    setTrein(
      (data ?? []).map((t: any) => ({
        nome: t.sms_treinamentos_catalogo?.nome ?? "—",
        status: t.status ?? "pendente",
        data_vencimento: t.data_vencimento,
      }))
    )
  }

  const fetchObraAtual = async () => {
    const { data } = await (supabase as any)
      .from("obra_funcionarios")
      .select("obras(nome)")
      .eq("employee_id", employee.id)
      .eq("status", true)
      .maybeSingle()
    setObraAtual(data?.obras?.nome ?? "")
  }

  const fetchEmpresa = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem("app-settings") ?? "{}")
      if (saved.companyName) setEmpresa(saved.companyName)
    } catch { /* usa padrão */ }
  }

  // Converte a foto para base64 via canvas (evita bloqueios CORS do fetch)
  const carregarFoto = () => {
    const url = employee.foto_url
    if (!url) return
    return new Promise<void>((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width  = img.naturalWidth  || 200
          canvas.height = img.naturalHeight || 200
          canvas.getContext("2d")?.drawImage(img, 0, 0)
          setFotoB64(canvas.toDataURL("image/jpeg", 0.9))
        } catch {
          // canvas foi taintado por CORS — usa a URL diretamente (funciona no popup)
          setFotoB64(url)
        }
        resolve()
      }
      img.onerror = () => {
        // Tenta sem crossOrigin como último recurso
        const img2 = new Image()
        img2.onload  = () => { setFotoB64(url); resolve() }
        img2.onerror = () => resolve()
        img2.src = url
      }
      img.src = url
    })
  }

  // ── Impressão ─────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const html = gerarHtmlCracha()
    const win = window.open("", "_blank", "width=900,height=700")
    if (!win) {
      toast({ title: "Popup bloqueado", description: "Permita popups e tente novamente.", variant: "destructive" })
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  const handleDownload = () => {
    const html = gerarHtmlCracha()
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cracha_${employee.nome.replace(/\s+/g, "_")}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── HTML imprimível ───────────────────────────────────────────────────────

  const gerarHtmlCracha = () => {
    const vencidos  = treinamentos.filter(t => t.status === "vencido").length
    const aVencer   = treinamentos.filter(t => t.status === "a_vencer").length
    const statusCor = vencidos > 0 ? "#dc2626" : aVencer > 0 ? "#d97706" : "#16a34a"
    const statusTxt = vencidos > 0 ? "IRREGULAR" : aVencer > 0 ? "A VENCER" : "REGULAR"

    const iniciais = employee.nome.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

    // Usa base64 (embed seguro) OU a URL original como fallback (funciona no popup do mesmo domínio)
    const fotoSrcHtml = fotoB64 || employee.foto_url || ""
    const fotoHtml = fotoSrcHtml
      ? `<img src="${fotoSrcHtml}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<div style="width:100%;height:100%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#475569;">${iniciais}</div>`

    const trRows = treinamentos.map(t => {
      const cor = t.status === "em_dia" ? "#16a34a" : t.status === "a_vencer" ? "#d97706" : "#dc2626"
      const venc = t.data_vencimento
        ? new Date(t.data_vencimento).toLocaleDateString("pt-BR")
        : "—"
      return `<tr>
        <td style="padding:2.5px 5px;font-size:8.5px;border-bottom:1px solid #f1f5f9">${t.nome}</td>
        <td style="padding:2.5px 5px;font-size:8.5px;font-weight:700;color:${cor};border-bottom:1px solid #f1f5f9">${t.status.replace("_"," ").toUpperCase()}</td>
        <td style="padding:2.5px 5px;font-size:8.5px;color:#64748b;border-bottom:1px solid #f1f5f9">${venc}</td>
      </tr>`
    }).join("") || `<tr><td colspan="3" style="padding:6px;text-align:center;font-size:8px;color:#94a3b8">Nenhum treinamento registrado</td></tr>`

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Crachá — ${employee.nome}</title>
  <style>
    @page { size: 85.6mm 54mm landscape; margin: 0 }
    @media print {
      body { margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact }
      .no-print { display:none !important }
      .card { page-break-after: always; box-shadow: none !important }
    }
    * { box-sizing: border-box }
    body { font-family: Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 16px }
    .wrapper { display:flex; flex-direction:column; align-items:center; gap:16px }
    .label { font-family:Arial; font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px }

    /* ── Card base ── */
    .card {
      width: 85.6mm; height: 54mm;
      background: white; border-radius: 5mm; overflow: hidden;
      display: flex; box-shadow: 0 4px 24px rgba(0,0,0,.18);
      position: relative;
    }

    /* ── Frente ── */
    .strip {
      width: 18mm; flex-shrink: 0;
      background: linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px; padding: 3mm 2mm;
    }
    .strip-logo  { font-size: 17px; line-height:1 }
    .strip-name  { font-size: 7px; color: #fbbf24; font-weight: 900; text-align:center; line-height:1.25; letter-spacing:.5px }
    .strip-obra  { font-size: 6px; color: #94a3b8; text-align:center; line-height:1.3; margin-top:2px; padding: 0 1px }

    /* Foto quadrada ao lado do nome */
    .photo-area {
      width: 30mm; flex-shrink: 0;
      display: flex; align-items: stretch;
      padding: 2.5mm 0 2.5mm 2mm;
    }
    .photo-square {
      width: 100%; aspect-ratio: 1;
      overflow: hidden;
      border: .5mm solid #e2e8f0;
      border-radius: 1.5mm;
      flex-shrink: 0;
    }

    .info {
      flex: 1; padding: 2.5mm 1.5mm 2mm 2mm;
      display: flex; flex-direction: column; justify-content: space-between;
      overflow: hidden;
    }
    .info-top { flex:1; min-height:0 }
    .emp-nome  { font-size: 10px; font-weight: 900; color: #0f172a; line-height:1.2; word-break:break-word }
    .emp-cargo { font-size: 7.5px; color: #475569; font-weight: 600; margin-top: 1mm }
    .emp-dept  { font-size: 6.5px; color: #94a3b8; margin-top: 0.5mm }
    .emp-obra  { font-size: 6.5px; color: #64748b; margin-top: 0.5mm; font-style:italic }
    .status-pill {
      display:inline-flex; align-items:center; gap: 2px;
      padding: .8mm 1.8mm; border-radius: 99px;
      font-size: 7px; font-weight: 800; color: white;
      background: ${statusCor}; margin-top: 1.5mm;
    }
    .footer-row {
      border-top: .3mm solid #f1f5f9; padding-top: 1mm; margin-top: 1mm;
      display: flex; gap: 4px; flex-wrap:wrap;
    }
    .footer-txt { font-size: 6px; color: #94a3b8 }

    /* QR grande — 30mm para leitura confiável */
    .qr-area {
      width: 32mm; flex-shrink: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 2mm 2.5mm 2mm 1mm;
      gap: 1mm;
    }
    .qr-area img { width: 28mm; height: 28mm }
    .qr-label { font-size: 5.5px; color: #94a3b8; text-align:center; letter-spacing:.3px }

    /* ── Verso ── */
    .card-back { flex-direction: row }
    .back-body {
      flex:1; padding: 2.5mm 3mm; display:flex; flex-direction:column;
    }
    .back-title {
      font-size: 8px; font-weight: 900; color: #0f172a;
      text-transform: uppercase; letter-spacing: .5px;
      border-bottom: .5mm solid #e2e8f0; padding-bottom: 1.5mm; margin-bottom: 1.5mm;
    }
    .back-sub { font-size: 7.5px; color: #475569; margin-bottom: 1.5mm; font-weight:600 }
    .tr-wrap { flex:1; overflow:hidden }
    .tr-table { width:100%; border-collapse:collapse }
    .tr-table th {
      font-size: 7px; font-weight:700; color: #94a3b8;
      text-transform:uppercase; letter-spacing:.3px;
      padding: 1mm 2mm; text-align:left;
    }
    .back-footer {
      border-top: .3mm solid #f1f5f9; padding-top: 1.5mm; margin-top: 1.5mm;
      display:flex; justify-content:space-between; align-items:center;
    }
    .back-footer-txt { font-size: 6.5px; color: #94a3b8 }

    /* Tela */
    .btn-row { display:flex; gap:10px; justify-content:center; margin-top:8px }
    .btn { padding:8px 22px; border-radius:6px; border:none; cursor:pointer; font-size:13px; font-weight:700 }
    .btn-print { background:#0f172a; color:white }
    .btn-close { background:#e2e8f0; color:#0f172a }
  </style>
</head>
<body>
<div class="wrapper">

  <!-- ── FRENTE ── -->
  <div class="no-print label">Frente</div>
  <div class="card">
    <!-- Faixa lateral -->
    <div class="strip">
      <span class="strip-logo">🏗️</span>
      <span class="strip-name">ÁPICE<br/>GESTÃO</span>
      ${obraAtual ? `<span class="strip-obra">${obraAtual}</span>` : ""}
    </div>

    <!-- Foto quadrada -->
    <div class="photo-area">
      <div class="photo-square">${fotoHtml}</div>
    </div>

    <!-- Informações -->
    <div class="info">
      <div class="info-top">
        <div class="emp-nome">${employee.nome}</div>
        <div class="emp-cargo">${employee.cargos?.nome ?? "—"}</div>
        <div class="emp-dept">${empresa}</div>
        ${obraAtual ? `<div class="emp-obra">📍 ${obraAtual}</div>` : ""}
        <div class="status-pill">🛡️ ${statusTxt}</div>
      </div>
      <div class="footer-row">
        <span class="footer-txt">ID: ${employee.id.slice(0, 8).toUpperCase()}</span>
        ${employee.cpf ? `<span class="footer-txt">· CPF: ${employee.cpf}</span>` : ""}
        ${employee.data_admissao ? `<span class="footer-txt">· Adm: ${new Date(employee.data_admissao).toLocaleDateString("pt-BR")}</span>` : ""}
      </div>
    </div>

    <!-- QR grande -->
    <div class="qr-area">
      ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code"/>` : ""}
      <span class="qr-label">PONTO QR</span>
    </div>
  </div>

  <!-- ── VERSO ── -->
  <div class="no-print label">Verso</div>
  <div class="card card-back">
    <!-- Faixa lateral -->
    <div class="strip">
      <span class="strip-logo">🏗️</span>
      <span class="strip-name">ÁPICE<br/>GESTÃO</span>
    </div>

    <!-- Corpo do verso -->
    <div class="back-body">
      <div class="back-title">Treinamentos</div>
      <div class="back-sub">${employee.nome}</div>
      <div class="tr-wrap">
        <table class="tr-table">
          <thead>
            <tr>
              <th>Treinamento</th>
              <th>Status</th>
              <th>Validade</th>
            </tr>
          </thead>
          <tbody>${trRows}</tbody>
        </table>
      </div>
      <div class="back-footer">
        <span class="back-footer-txt">ID: ${employee.id.slice(0, 8).toUpperCase()}</span>
        <span class="back-footer-txt">Gerado em ${new Date().toLocaleDateString("pt-BR")}</span>
      </div>
    </div>
  </div>

  <!-- Botões -->
  <div class="btn-row no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir (Frente + Verso)</button>
    <button class="btn btn-close" onclick="window.close()">Fechar</button>
  </div>

</div>
</body>
</html>`
  }

  // ── Preview no dialog ─────────────────────────────────────────────────────

  const vencidos  = treinamentos.filter(t => t.status === "vencido").length
  const aVencer   = treinamentos.filter(t => t.status === "a_vencer").length
  const statusCor = vencidos > 0 ? "#dc2626" : aVencer > 0 ? "#d97706" : "#16a34a"
  const statusTxt = vencidos > 0 ? "IRREGULAR" : aVencer > 0 ? "A VENCER" : "REGULAR"
  const iniciais  = employee.nome.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
  const fotoSrc   = fotoB64 || employee.foto_url || null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Crachá — {employee.nome}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            Gerando crachá...
          </div>
        ) : (
          <div className="space-y-4">

            {/* Tabs frente / verso */}
            <div className="flex rounded-lg bg-muted/40 p-1 gap-1">
              {(["frente", "verso"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    activeTab === t
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {t === "frente" ? "🪪 Frente" : "📋 Verso (treinamentos)"}
                </button>
              ))}
            </div>

            {/* Preview Frente */}
            {activeTab === "frente" && (
              <div
                className="rounded-xl overflow-hidden border border-border/50 shadow-sm flex"
                style={{ height: "152px" }}
              >
                {/* Faixa escura */}
                <div
                  className="flex flex-col items-center justify-center gap-1 px-2 flex-shrink-0"
                  style={{ width: "56px", background: "linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)" }}
                >
                  <span className="text-xl">🏗️</span>
                  <span className="text-[7px] font-black text-amber-400 text-center leading-tight">ÁPICE<br/>GESTÃO</span>
                  {obraAtual && (
                    <span className="text-[6px] text-slate-400 text-center leading-tight mt-0.5 px-0.5">{obraAtual}</span>
                  )}
                </div>

                {/* Foto QUADRADA */}
                <div className="flex items-center py-2 pl-2 flex-shrink-0">
                  <div className="w-24 h-24 rounded overflow-hidden border border-border flex-shrink-0 bg-muted flex items-center justify-center">
                    {fotoSrc ? (
                      <img src={fotoSrc} alt="foto" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-muted-foreground">{iniciais}</span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 px-2 py-2 flex flex-col justify-between min-w-0 overflow-hidden">
                  <div>
                    <p className="font-black text-sm leading-tight text-foreground truncate">{employee.nome}</p>
                    <p className="text-xs text-muted-foreground font-semibold truncate">{employee.cargos?.nome ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground/70 truncate">{empresa}</p>
                    {obraAtual && (
                      <p className="text-[10px] text-muted-foreground italic truncate">📍 {obraAtual}</p>
                    )}
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full text-white mt-1"
                      style={{ background: statusCor }}
                    >
                      🛡️ {statusTxt}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    ID: {employee.id.slice(0, 8).toUpperCase()}
                    {employee.cpf ? ` · ${employee.cpf}` : ""}
                  </p>
                </div>

                {/* QR GRANDE */}
                {qrDataUrl && (
                  <div className="flex flex-col items-center justify-center px-2 flex-shrink-0 gap-1">
                    <img src={qrDataUrl} alt="QR" className="w-24 h-24" />
                    <span className="text-[8px] text-muted-foreground font-medium">PONTO QR</span>
                  </div>
                )}
              </div>
            )}

            {/* Preview Verso */}
            {activeTab === "verso" && (
              <div
                className="rounded-xl overflow-hidden border border-border/50 shadow-sm flex"
                style={{ height: "136px" }}
              >
                {/* Faixa escura */}
                <div
                  className="flex flex-col items-center justify-center gap-1 px-2 flex-shrink-0"
                  style={{ width: "60px", background: "linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)" }}
                >
                  <span className="text-xl">🏗️</span>
                  <span className="text-[7px] font-black text-amber-400 text-center leading-tight">ÁPICE<br/>GESTÃO</span>
                </div>

                {/* Tabela de treinamentos */}
                <div className="flex-1 px-3 py-2 flex flex-col overflow-hidden">
                  <p className="text-[9px] font-black uppercase tracking-wider text-foreground border-b border-border/50 pb-1 mb-1.5">
                    Treinamentos — {employee.nome.split(" ")[0]}
                  </p>
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {treinamentos.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center pt-4">Nenhum treinamento registrado</p>
                    ) : treinamentos.map((t, i) => {
                      const st = trStatusStyle[t.status]
                      return (
                        <div key={i} className="flex items-center gap-1.5">
                          {trIcone(t.status)}
                          <span className="text-[10px] flex-1 truncate">{t.nome}</span>
                          <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${st.cls} flex-shrink-0`}>
                            {st.label}
                          </span>
                          {t.data_vencimento && (
                            <span className="text-[8px] text-muted-foreground flex-shrink-0">
                              {new Date(t.data_vencimento).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[8px] text-muted-foreground border-t border-border/50 pt-1 mt-1">
                    ID: {employee.id.slice(0, 8).toUpperCase()} · {new Date().toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Frente + Verso
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Baixar HTML
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
