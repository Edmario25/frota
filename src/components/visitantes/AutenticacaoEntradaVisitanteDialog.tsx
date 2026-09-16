import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Obra = { id: string; nome: string };
type Employee = { id: string; nome: string };

export function AutenticacaoEntradaVisitanteDialog({ open, onOpenChange, obras, employees, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; obras: Obra[]; employees: Employee[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState("");
  const [codigoVeiculo, setCodigoVeiculo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [setor, setSetor] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const limpar = () => { setCodigo(""); setCodigoVeiculo(""); setMotivo(""); setSetor(""); setResponsavel(""); setObservacoes(""); };
  const salvar = async () => {
    if (!codigo.trim() || !motivo.trim()) { toast({ title: "Informe o crachá e o motivo da visita", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc("liberar_entrada_visitante", {
      p_codigo_pessoa: codigo.trim(), p_motivo: motivo.trim(), p_setor_destino: setor || null,
      p_responsavel_id: responsavel || null, p_observacoes: observacoes || null, p_codigo_veiculo: codigoVeiculo || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Entrada não liberada", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Entrada autenticada", description: "Crachá e briefing válidos. A entrada foi registrada." });
    limpar(); onOpenChange(false); onSaved();
  };
  return <Dialog open={open} onOpenChange={v => { if (!v) limpar(); onOpenChange(v); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Autenticar entrada</DialogTitle><DialogDescription>A recepção apenas valida o QR Code ou número do crachá. Documento, validade e briefing são conferidos pelo sistema.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-2">
        <div><Label>Crachá pessoal / QR Code *</Label><Input autoFocus value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Leia o QR ou informe P-XXXXXXXX" /></div>
        <div><Label>Credencial do veículo / QR Code</Label><Input value={codigoVeiculo} onChange={e => setCodigoVeiculo(e.target.value)} placeholder="Obrigatório se houver veículo" /></div>
        <div><Label>Motivo da visita *</Label><Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: Reunião, entrega, vistoria" /></div>
        <div className="grid grid-cols-2 gap-3"><div><Label>Setor / destino</Label><Input value={setor} onChange={e => setSetor(e.target.value)} /></div><div><Label>Responsável visitado</Label><Select value={responsavel || "__none"} onValueChange={v => setResponsavel(v === "__none" ? "" : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="__none">Não informado</SelectItem>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select></div></div>
        <div><Label>Observações</Label><Textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Validando..." : "Validar e liberar entrada"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
