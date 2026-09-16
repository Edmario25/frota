import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type CredencialVisitante = {
  id: string;
  tipo: "pessoa" | "veiculo";
  numero: string;
  qr_token: string;
  validade_ate: string;
  placa_veiculo?: string | null;
  visitante_nome: string;
  visitante_empresa?: string | null;
  obra_nome: string;
};

export function CredencialVisitanteDialog({
  open, onOpenChange, credencial,
}: { open: boolean; onOpenChange: (open: boolean) => void; credencial: CredencialVisitante | null }) {
  const { toast } = useToast();
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!open || !credencial) return;
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(`VG:${credencial.qr_token}`, {
      width: 600, margin: 2, errorCorrectionLevel: "H",
      color: { dark: "#0f172a", light: "#ffffff" },
    })).then(setQr).catch(() => setQr(""));
  }, [open, credencial]);

  if (!credencial) return null;
  const validade = new Date(credencial.validade_ate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const titulo = credencial.tipo === "pessoa" ? "CRACHÁ DE VISITANTE" : "CREDENCIAL DE VEÍCULO";

  const imprimir = () => {
    const popup = window.open("", "_blank", "width=700,height=520");
    if (!popup) { toast({ title: "Popup bloqueado", description: "Permita popups para imprimir o crachá.", variant: "destructive" }); return; }
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>
      @page{size:85.6mm 54mm landscape;margin:0}@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none!important}}
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#eef2f7;padding:20px}.card{width:85.6mm;height:54mm;background:#fff;border-radius:4mm;overflow:hidden;display:flex;box-shadow:0 5px 20px #0003}.band{width:15mm;background:#102a52;color:#fff;padding:4mm 2mm;font-size:7px;font-weight:800;text-align:center}.band b{color:#f5bd3d;font-size:8px}.info{padding:4mm 2mm 3mm 4mm;flex:1}.type{font-size:7px;color:#2563eb;font-weight:800;letter-spacing:.8px}.name{font-size:12px;font-weight:900;color:#10213b;margin-top:2mm;line-height:1.1}.sub{font-size:7px;color:#52657f;margin-top:1mm}.number{font:700 8px monospace;color:#10213b;margin-top:3mm}.valid{font-size:7px;color:#047857;font-weight:700;margin-top:2mm}.qr{width:27mm;padding:3mm 3mm 2mm 1mm;text-align:center}.qr img{width:22mm;height:22mm}.qr span{display:block;font:6px monospace;color:#64748b}.actions{text-align:center;margin-top:12px}.actions button{border:0;background:#102a52;color:#fff;padding:9px 20px;border-radius:6px;font-weight:700;cursor:pointer}
    </style></head><body><div class="card"><div class="band"><b>ÁPICE</b><br>GESTÃO<br><br>VISITANTE</div><div class="info"><div class="type">${titulo}</div><div class="name">${credencial.tipo === "pessoa" ? credencial.visitante_nome : (credencial.placa_veiculo ?? "VEÍCULO")}</div><div class="sub">${credencial.tipo === "pessoa" ? (credencial.visitante_empresa || "Visitante") : `${credencial.visitante_nome} · ${credencial.visitante_empresa || "Visitante"}`}</div><div class="sub">Obra: ${credencial.obra_nome}</div><div class="number">${credencial.numero}</div><div class="valid">VÁLIDO ATÉ ${validade}</div></div><div class="qr">${qr ? `<img src="${qr}"/>` : ""}<span>VALIDAÇÃO DE ACESSO</span></div></div><div class="actions no-print"><button onclick="window.print()">Imprimir credencial</button></div></body></html>`);
    popup.document.close();
    setTimeout(() => popup.print(), 350);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" />{titulo}</DialogTitle></DialogHeader>
      <div className="rounded-xl border overflow-hidden bg-white flex min-h-48">
        <div className="w-16 bg-slate-900 text-center text-[10px] font-black pt-8 leading-tight text-amber-400">ÁPICE<br/>GESTÃO</div>
        <div className="flex-1 p-4 min-w-0"><p className="text-xs font-bold text-primary tracking-wide">{titulo}</p><p className="mt-2 font-black text-lg leading-tight">{credencial.tipo === "pessoa" ? credencial.visitante_nome : credencial.placa_veiculo}</p><p className="mt-1 text-xs text-muted-foreground truncate">{credencial.obra_nome}</p><p className="mt-3 font-mono font-bold text-sm">{credencial.numero}</p><p className="mt-2 text-xs font-bold text-emerald-700">Válido até {validade}</p></div>
        <div className="w-28 p-3 flex flex-col justify-center items-center">{qr && <img src={qr} alt="QR Code" className="w-20 h-20" />}<span className="mt-1 text-[8px] text-muted-foreground text-center">VALIDAÇÃO DE ACESSO</span></div>
      </div>
      <Button onClick={imprimir}><Printer className="h-4 w-4 mr-2" />Imprimir com QR Code</Button>
    </DialogContent>
  </Dialog>;
}
