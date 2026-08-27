import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Activity, ClipboardPlus, HeartPulse, Leaf, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Kind = "pgr" | "saude" | "ambiental";
type Obra = { id: string; nome: string };
type Employee = { id: string; nome: string };
type Row = Record<string, any> & { id: string; obras?: { nome: string } | null; employees?: { nome: string } | null };
const inputClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export default function SmsGestaoLegal() {
  const [tab, setTab] = useState<Kind>("pgr");
  const [rows, setRows] = useState<Record<Kind, Row[]>>({ pgr: [], saude: [], ambiental: [] });
  const [obras, setObras] = useState<Obra[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pgr, saude, ambiental, obrasRes, empRes] = await Promise.all([
      (supabase as any).from("sms_pgr_inventario").select("*,obras(nome)").order("created_at", { ascending: false }),
      (supabase as any).from("sms_saude_ocupacional").select("*,employees(nome),obras(nome)").order("data_exame", { ascending: false }),
      (supabase as any).from("sms_aspectos_ambientais").select("*,obras(nome)").order("created_at", { ascending: false }),
      (supabase as any).from("obras").select("id,nome").order("nome"),
      (supabase as any).from("employees").select("id,nome").eq("status", "ativo").order("nome"),
    ]);
    const error = [pgr, saude, ambiental].find(r => r.error)?.error;
    if (error) toast.error(`Execute a atualização do banco para habilitar a Gestão Legal: ${error.message}`);
    setRows({ pgr: pgr.data ?? [], saude: saude.data ?? [], ambiental: ambiental.data ?? [] });
    setObras(obrasRes.data ?? []); setEmployees(empRes.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const reset = () => setForm({ obra_id: obras[0]?.id ?? "", probabilidade: "3", severidade: "3", frequencia: "3" });

  async function save() {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    let table = "sms_pgr_inventario";
    let payload: Record<string, unknown> = { ...form, probabilidade: Number(form.probabilidade), severidade: Number(form.severidade), registrado_por: auth.user?.id };
    if (tab === "saude") {
      table = "sms_saude_ocupacional";
      payload = { colaborador_id: form.colaborador_id, obra_id: form.obra_id || null, tipo_exame: form.tipo_exame, data_exame: form.data_exame, vencimento: form.vencimento || null, aptidao: form.aptidao, restricoes: form.restricoes || null, registrado_por: auth.user?.id };
    } else if (tab === "ambiental") {
      table = "sms_aspectos_ambientais";
      payload = { ...form, frequencia: Number(form.frequencia), severidade: Number(form.severidade), registrado_por: auth.user?.id };
    }
    const { error } = await (supabase as any).from(table).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Registro incluído com rastreabilidade."); setOpen(false); reset(); load();
  }

  const score = (r: Row) => Number(r.probabilidade ?? r.frequencia) * Number(r.severidade);
  const fieldsOk = tab === "pgr" ? form.obra_id && form.processo_atividade && form.perigo && form.grupo_risco : tab === "saude" ? form.colaborador_id && form.tipo_exame && form.data_exame && form.aptidao : form.obra_id && form.atividade && form.aspecto && form.impacto;

  return <Layout><div className="mx-auto max-w-screen-xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">SMS / Requisitos legais</p><h1 className="text-2xl font-bold">GRO/PGR, Saúde e Meio Ambiente</h1><p className="text-sm text-muted-foreground">Inventários, exames ocupacionais, riscos e aspectos ambientais por obra.</p></div>
      <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) reset(); }}><DialogTrigger asChild><Button><ClipboardPlus className="mr-2 h-4 w-4" />Novo registro</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Novo registro — {tab === "pgr" ? "Inventário PGR" : tab === "saude" ? "Saúde ocupacional" : "Aspecto ambiental"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label>Obra</Label><select className={inputClass} value={form.obra_id ?? ""} onChange={e => set("obra_id", e.target.value)}><option value="">Selecione</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
          {tab === "pgr" && <><div><Label>Processo / atividade</Label><Input value={form.processo_atividade ?? ""} onChange={e => set("processo_atividade", e.target.value)} /></div><div><Label>Perigo</Label><Input value={form.perigo ?? ""} onChange={e => set("perigo", e.target.value)} /></div><div><Label>Grupo de risco</Label><select className={inputClass} value={form.grupo_risco ?? ""} onChange={e => set("grupo_risco", e.target.value)}><option value="">Selecione</option>{["fisico","quimico","biologico","ergonomico","acidente"].map(v => <option key={v} value={v}>{v}</option>)}</select></div><ScoreFields form={form} set={set} first="probabilidade" /><div className="sm:col-span-2"><Label>Medidas existentes</Label><Input value={form.medidas_existentes ?? ""} onChange={e => set("medidas_existentes", e.target.value)} /></div></>}
          {tab === "saude" && <><div><Label>Funcionário</Label><select className={inputClass} value={form.colaborador_id ?? ""} onChange={e => set("colaborador_id", e.target.value)}><option value="">Selecione</option>{employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div><div><Label>Tipo de exame</Label><select className={inputClass} value={form.tipo_exame ?? ""} onChange={e => set("tipo_exame", e.target.value)}><option value="">Selecione</option>{["admissional","periodico","retorno","mudanca_risco","demissional"].map(v => <option key={v} value={v}>{v}</option>)}</select></div><div><Label>Data do exame</Label><Input type="date" value={form.data_exame ?? ""} onChange={e => set("data_exame", e.target.value)} /></div><div><Label>Vencimento</Label><Input type="date" value={form.vencimento ?? ""} onChange={e => set("vencimento", e.target.value)} /></div><div><Label>Aptidão</Label><select className={inputClass} value={form.aptidao ?? ""} onChange={e => set("aptidao", e.target.value)}><option value="">Selecione</option><option value="apto">Apto</option><option value="apto_com_restricao">Apto com restrição</option><option value="inapto">Inapto</option></select></div><div><Label>Restrições</Label><Input value={form.restricoes ?? ""} onChange={e => set("restricoes", e.target.value)} /></div></>}
          {tab === "ambiental" && <><div><Label>Atividade</Label><Input value={form.atividade ?? ""} onChange={e => set("atividade", e.target.value)} /></div><div><Label>Aspecto ambiental</Label><Input value={form.aspecto ?? ""} onChange={e => set("aspecto", e.target.value)} /></div><div><Label>Impacto</Label><Input value={form.impacto ?? ""} onChange={e => set("impacto", e.target.value)} /></div><div><Label>Requisito legal</Label><Input value={form.requisito_legal ?? ""} onChange={e => set("requisito_legal", e.target.value)} /></div><ScoreFields form={form} set={set} first="frequencia" /></>}
        </div><Button onClick={save} disabled={saving || !fieldsOk}>{saving ? "Salvando..." : "Salvar registro"}</Button>
      </DialogContent></Dialog>
    </div>
    <Tabs value={tab} onValueChange={value => setTab(value as Kind)}><TabsList className="grid w-full max-w-2xl grid-cols-3"><TabsTrigger value="pgr"><ShieldCheck className="mr-2 h-4 w-4" />GRO / PGR</TabsTrigger><TabsTrigger value="saude"><HeartPulse className="mr-2 h-4 w-4" />Saúde</TabsTrigger><TabsTrigger value="ambiental"><Leaf className="mr-2 h-4 w-4" />Meio ambiente</TabsTrigger></TabsList>
      {(["pgr","saude","ambiental"] as Kind[]).map(kind => <TabsContent key={kind} value={kind} className="mt-4 rounded-xl border bg-card"><div className="divide-y">{rows[kind].length === 0 && <div className="py-16 text-center text-sm text-muted-foreground"><Activity className="mx-auto mb-3 h-8 w-8" />Nenhum registro neste módulo.</div>}{rows[kind].map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 p-4"><div className="flex-1"><p className="font-medium">{r.perigo ?? r.employees?.nome ?? r.aspecto}</p><p className="text-xs text-muted-foreground">{r.obras?.nome ?? "Sem obra"} · {r.processo_atividade ?? r.tipo_exame ?? r.atividade}</p></div>{kind !== "saude" && <Badge variant={score(r) >= 15 ? "destructive" : "secondary"}>Nível {score(r)}</Badge>}{kind === "saude" && <Badge variant={r.aptidao === "inapto" ? "destructive" : "secondary"}>{r.aptidao}</Badge>}</div>)}</div></TabsContent>)}
    </Tabs>
  </div></Layout>;
}

function ScoreFields({ form, set, first }: { form: Record<string, string>; set: (key: string, value: string) => void; first: "probabilidade" | "frequencia" }) {
  return <><div><Label>{first === "probabilidade" ? "Probabilidade" : "Frequência"} (1–5)</Label><Input type="number" min="1" max="5" value={form[first] ?? "3"} onChange={e => set(first, e.target.value)} /></div><div><Label>Severidade (1–5)</Label><Input type="number" min="1" max="5" value={form.severidade ?? "3"} onChange={e => set("severidade", e.target.value)} /></div></>;
}
