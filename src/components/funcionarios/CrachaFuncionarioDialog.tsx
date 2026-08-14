import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Printer, Download, QrCode, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmployeeLite {
  id: string
  nome: string
  cpf?: string
  data_admissao?: string | null
  cargos?: { nome: string } | null
  departamentos?: { nome: string } | null
}

interface TreinamentoStatus {
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
  const [qrDataUrl, setQrDataUrl]   = useState<string>("")
  const [treinamentos, setTrein]    = useState<TreinamentoStatus[]>([])
  const [obraAtual, setObraAtual]   = useState<string>("")
  const [empresa, setEmpresa]       = useState<string>("Ápice Gestão")
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (open && employee) {
      setLoading(true)
      Promise.all([gerarQr(), fetchTreinamentos(), fetchObraAtual(), fetchEmpresa()])
        .finally(() => setLoading(false))
    }
  }, [open, employee])

  // ── Data fetching ─────────────────────────────────────────────────────────

  const gerarQr = async () => {
    try {
      const QRCode = (await import("qrcode")).default
      const url = await QRCode.toDataURL(employee.id, {
        width: 200, margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
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
    // Tenta pegar da configuração salva no localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("app-settings") ?? "{}")
      if (saved.companyName) setEmpresa(saved.companyName)
    } catch { /* usa padrão */ }
  }

  // ── Impressão ─────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const html = gerarHtmlCracha()
    const win = window.open("", "_blank", "width=900,height=600")
    if (!win) { toast({ title: "Popup bloqueado", description: "Permita popups e tente novamente.", variant: "destructive" }); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
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

  // ── HTML do crachá ────────────────────────────────────────────────────────

  const gerarHtmlCracha = () => {
    const vencidos   = treinamentos.filter(t => t.status === "vencido").length
    const aVencer    = treinamentos.filter(t => t.status === "a_vencer").length
    const emDia      = treinamentos.filter(t => t.status === "em_dia").length
    const statusGeral = vencidos > 0 ? "VENCIDO" : aVencer > 0 ? "A VENCER" : "EM DIA"
    const statusCor   = vencidos > 0 ? "#dc2626" : aVencer > 0 ? "#d97706" : "#16a34a"

    const trRows = treinamentos.map(t => {
      const cor = t.status === "em_dia" ? "#16a34a" : t.status === "a_vencer" ? "#d97706" : "#dc2626"
      const venc = t.data_vencimento
        ? new Date(t.data_vencimento).toLocaleDateString("pt-BR")
        : "—"
      return `<tr>
        <td style="padding:3px 6px;font-size:10px">${t.nome}</td>
        <td style="padding:3px 6px;font-size:10px;color:${cor};font-weight:600">${t.status.replace("_", " ").toUpperCase()}</td>
        <td style="padding:3px 6px;font-size:10px">${venc}</td>
      </tr>`
    }).join("")

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Crachá — ${employee.nome}</title>
  <style>
    @page { size: 85.6mm 54mm landscape; margin: 0 }
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
      .no-print { display: none }
      .card { page-break-after: always }
    }
    body { font-family: Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 20px }
    .wrapper { display: flex; flex-direction: column; align-items: center; gap: 24px }
    .card {
      width: 85.6mm; height: 54mm; background: white;
      border-radius: 6mm; overflow: hidden;
      display: flex; box-shadow: 0 4px 20px rgba(0,0,0,.15);
    }
    .left {
      width: 22mm; background: linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 6px; padding: 4mm;
    }
    .left .logo { font-size: 8px; color: #fbbf24; font-weight: 900; letter-spacing: 1px; text-align: center; line-height: 1.3 }
    .left .hat { font-size: 18px }
    .left .obra-label { font-size: 7px; color: #94a3b8; text-align: center; line-height: 1.3; margin-top: 2px }
    .right { flex: 1; padding: 3mm 4mm; display: flex; flex-direction: column; justify-content: space-between }
    .nome { font-size: 11px; font-weight: 900; color: #0f172a; line-height: 1.2; word-break: break-word }
    .cargo { font-size: 8.5px; color: #475569; font-weight: 600; margin-top: 1mm }
    .empresa { font-size: 7.5px; color: #94a3b8; margin-top: 0.5mm }
    .middle { display: flex; gap: 3mm; align-items: flex-end; flex: 1; margin-top: 2mm }
    .info { flex: 1 }
    .status-pill {
      display: inline-block; padding: 1mm 2.5mm;
      border-radius: 99px; font-size: 8px; font-weight: 700;
      color: white; background: ${statusCor}; margin-top: 2mm;
    }
    .tr-summary { font-size: 7.5px; color: #64748b; margin-top: 1.5mm; line-height: 1.6 }
    .qr { width: 17mm; height: 17mm; flex-shrink: 0 }
    .qr img { width: 100%; height: 100%; object-fit: contain }
    .footer { border-top: 0.5mm solid #e2e8f0; padding-top: 1.5mm; margin-top: 1.5mm; display: flex; justify-content: space-between; align-items: center }
    .footer-txt { font-size: 7px; color: #94a3b8 }

    /* Página extra: lista de treinamentos (impressão A4) */
    .tr-page { display: none }
    @media print { .tr-page { display: block; page-break-before: always } }
    .tr-table { width: 100%; border-collapse: collapse; font-family: Arial }
    .tr-table th { background: #0f172a; color: white; padding: 5px 8px; font-size: 10px; text-align: left }
    .tr-table tr:nth-child(even) td { background: #f8fafc }
    .tr-table td { border-bottom: 1px solid #e2e8f0 }

    .btn-row { display: flex; gap: 10px; justify-content: center; margin-top: 12px }
    .btn { padding: 8px 20px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600 }
    .btn-print { background: #0f172a; color: white }
    .btn-close { background: #e2e8f0; color: #0f172a }
  </style>
</head>
<body>
<div class="wrapper">

  <!-- Crachá -->
  <div class="card">
    <div class="left">
      <span class="hat">🏗️</span>
      <span class="logo">ÁPICE<br/>GESTÃO</span>
      ${obraAtual ? `<span class="obra-label">${obraAtual}</span>` : ""}
    </div>
    <div class="right">
      <div>
        <div class="nome">${employee.nome}</div>
        <div class="cargo">${employee.cargos?.nome ?? "—"}</div>
        <div class="empresa">${empresa}</div>
      </div>
      <div class="middle">
        <div class="info">
          <span class="status-pill">🛡️ ${statusGeral}</span>
          <div class="tr-summary">
            ✅ ${emDia} em dia &nbsp; ⚠️ ${aVencer} a vencer &nbsp; ❌ ${vencidos} vencidos
          </div>
        </div>
        <div class="qr">
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR"/>` : ""}
        </div>
      </div>
      <div class="footer">
        <span class="footer-txt">ID: ${employee.id.slice(0, 8).toUpperCase()}</span>
        ${employee.cpf ? `<span class="footer-txt">CPF: ${employee.cpf}</span>` : ""}
        ${employee.data_admissao ? `<span class="footer-txt">Adm: ${new Date(employee.data_admissao).toLocaleDateString("pt-BR")}</span>` : ""}
      </div>
    </div>
  </div>

  <!-- Botões (não imprimem) -->
  <div class="btn-row no-print">
    <button class="btn btn-print" onclick="window.print()">🖨️ Imprimir</button>
    <button class="btn btn-close" onclick="window.close()">Fechar</button>
  </div>

  <!-- Tabela de treinamentos (impressão A4 após o crachá) -->
  <div class="tr-page">
    <h3 style="font-family:Arial;font-size:13px;margin-bottom:8px">
      Treinamentos — ${employee.nome}
    </h3>
    <table class="tr-table">
      <thead><tr>
        <th>Treinamento</th><th>Status</th><th>Validade</th>
      </tr></thead>
      <tbody>${trRows || '<tr><td colspan="3" style="padding:8px;text-align:center;font-size:10px">Nenhum treinamento registrado</td></tr>'}</tbody>
    </table>
  </div>

</div>
</body>
</html>`
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  const vencidos  = treinamentos.filter(t => t.status === "vencido").length
  const aVencer   = treinamentos.filter(t => t.status === "a_vencer").length
  const emDia     = treinamentos.filter(t => t.status === "em_dia").length

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

            {/* Preview do card */}
            <div className="rounded-xl overflow-hidden border border-border/50 shadow-sm flex" style={{ height: "130px" }}>
              {/* Lateral esquerda */}
              <div className="w-20 flex flex-col items-center justify-center gap-1 px-2"
                style={{ background: "linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)" }}>
                <span className="text-2xl">🏗️</span>
                <span className="text-[8px] font-black text-amber-400 text-center leading-tight">ÁPICE<br/>GESTÃO</span>
                {obraAtual && (
                  <span className="text-[7px] text-slate-400 text-center leading-tight mt-0.5">{obraAtual}</span>
                )}
              </div>

              {/* Corpo */}
              <div className="flex-1 px-3 py-2 flex flex-col justify-between">
                <div>
                  <p className="font-black text-sm leading-tight text-foreground">{employee.nome}</p>
                  <p className="text-xs text-muted-foreground font-semibold">{employee.cargos?.nome ?? "—"}</p>
                  <p className="text-[10px] text-muted-foreground/70">Empresa: {employee.departamentos?.nome ?? "—"}</p>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex gap-1 flex-wrap">
                      {vencidos > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          ❌ {vencidos} vencido{vencidos > 1 ? "s" : ""}
                        </span>
                      )}
                      {aVencer > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          ⚠️ {aVencer} a vencer
                        </span>
                      )}
                      {emDia > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          ✅ {emDia} em dia
                        </span>
                      )}
                      {treinamentos.length === 0 && (
                        <span className="text-[9px] text-muted-foreground">Sem treinamentos</span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      ID: {employee.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="QR" className="w-12 h-12 flex-shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {/* Lista de treinamentos */}
            {treinamentos.length > 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/50">
                  <p className="text-xs font-semibold">Treinamentos</p>
                </div>
                <div className="divide-y divide-border/30 max-h-40 overflow-y-auto">
                  {treinamentos.map((t, i) => {
                    const st = trStatusStyle[t.status]
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        {trIcone(t.status)}
                        <span className="text-xs flex-1">{t.nome}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                        {t.data_vencimento && (
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(t.data_vencimento).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Crachá
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
