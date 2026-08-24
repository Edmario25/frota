import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft, ClipboardCheck, FileCheck2, FlaskConical, Pencil, Plus,
  RefreshCw, Search, ShieldCheck, Trash2, Truck,
} from "lucide-react";

type Field = { key: string; label: string; type?: "text" | "date" | "number" | "textarea" | "url" | "select"; required?: boolean; options?: Array<[string, string]>; span?: boolean; source?: "material" | "fornecedor" };
type ModuleConfig = { title: string; subtitle: string; table: string; icon: any; fields: Field[]; select: string; statusKey: string; columns: Array<{ label: string; value: (row: any) => string }> };

const resultService: Array<[string, string]> = [["pendente","Pendente"],["aprovado","Aprovado"],["aprovado_com_restricao","Aprovado com restrição"],["reprovado","Reprovado"]];
const resultMaterial: Array<[string, string]> = [["pendente","Pendente"],["aprovado","Aprovado"],["quarentena","Quarentena"],["reprovado","Reprovado"]];
const today = () => new Date().toISOString().slice(0, 10);
const display = (value: unknown) => value == null || value === "" ? "—" : String(value).replaceAll("_", " ");

const configs: Record<string, ModuleConfig> = {
  servicos: {
    title: "Inspeção de Serviços — FVS", subtitle: "Verificação, evidências e liberação dos serviços executados.", table: "qualidade_inspecoes_servicos", icon: ClipboardCheck, statusKey: "resultado",
    select: "*, obras(nome), nao_conformidades(numero_nc)",
    fields: [
      { key:"obra_id",label:"Obra",type:"select",required:true }, { key:"data_inspecao",label:"Data da inspeção",type:"date",required:true },
      { key:"servico",label:"Serviço",required:true }, { key:"local_frente",label:"Local / Frente",required:true },
      { key:"criterio_aceitacao",label:"Critério de aceitação",type:"textarea",required:true,span:true },
      { key:"resultado",label:"Resultado",type:"select",options:resultService,required:true }, { key:"responsavel",label:"Inspetor / Responsável" },
      { key:"evidencia_url",label:"Link da evidência",type:"url",span:true }, { key:"observacoes",label:"Observações",type:"textarea",span:true },
    ],
    columns: [{label:"Serviço",value:r=>r.servico},{label:"Local",value:r=>r.local_frente},{label:"Data",value:r=>new Date(`${r.data_inspecao}T00:00:00`).toLocaleDateString("pt-BR")},{label:"Responsável",value:r=>r.responsavel},{label:"Resultado",value:r=>r.resultado}],
  },
  materiais: {
    title: "Controle de Materiais — FVM", subtitle: "Recebimento, lote, certificados, rastreabilidade e aprovação.", table: "qualidade_inspecoes_materiais", icon: FlaskConical, statusKey: "resultado",
    select: "*, obras(nome), materiais_catalogo(nome), fornecedores(nome), nao_conformidades(numero_nc)",
    fields: [
      { key:"obra_id",label:"Obra",type:"select",required:true }, { key:"data_recebimento",label:"Data do recebimento",type:"date",required:true },
      { key:"material_id",label:"Material do catálogo",type:"select",source:"material" }, { key:"material_nome",label:"Descrição do material",required:true },
      { key:"fornecedor_id",label:"Fornecedor",type:"select",source:"fornecedor" }, { key:"nota_fiscal",label:"Nota fiscal" },
      { key:"lote",label:"Lote" }, { key:"certificado",label:"Certificado / Laudo" },
      { key:"quantidade",label:"Quantidade",type:"number" }, { key:"unidade",label:"Unidade" },
      { key:"validade",label:"Validade",type:"date" }, { key:"resultado",label:"Resultado",type:"select",options:resultMaterial,required:true },
      { key:"local_aplicacao",label:"Local de aplicação / armazenamento",span:true }, { key:"evidencia_url",label:"Link da evidência",type:"url",span:true },
      { key:"observacoes",label:"Observações",type:"textarea",span:true },
    ],
    columns: [{label:"Material",value:r=>r.material_nome},{label:"Fornecedor",value:r=>r.fornecedores?.nome},{label:"Lote",value:r=>r.lote},{label:"Recebimento",value:r=>new Date(`${r.data_recebimento}T00:00:00`).toLocaleDateString("pt-BR")},{label:"Resultado",value:r=>r.resultado}],
  },
  documentos: {
    title: "Documentos da Qualidade", subtitle: "Controle de códigos, revisões, aprovações, validade e distribuição.", table: "qualidade_documentos", icon: FileCheck2, statusKey: "status", select: "*, obras(nome)",
    fields: [
      { key:"obra_id",label:"Obra",type:"select",required:true }, { key:"codigo",label:"Código",required:true },
      { key:"titulo",label:"Título",required:true,span:true }, { key:"tipo",label:"Tipo",type:"select",required:true,options:[["plano_qualidade","Plano da Qualidade"],["pes","PES"],["procedimento","Procedimento"],["formulario","Formulário"],["projeto","Projeto"],["certificado","Certificado"],["outro","Outro"]] },
      { key:"revisao",label:"Revisão",required:true }, { key:"status",label:"Status",type:"select",required:true,options:[["rascunho","Rascunho"],["em_revisao","Em revisão"],["aprovado","Aprovado"],["obsoleto","Obsoleto"]] },
      { key:"data_emissao",label:"Emissão",type:"date",required:true }, { key:"data_validade",label:"Validade",type:"date" },
      { key:"responsavel",label:"Elaborado por" }, { key:"aprovador",label:"Aprovado por" },
      { key:"arquivo_url",label:"Link do documento",type:"url",span:true }, { key:"observacoes",label:"Observações",type:"textarea",span:true },
    ],
    columns: [{label:"Código",value:r=>`${r.codigo} · Rev. ${r.revisao}`},{label:"Documento",value:r=>r.titulo},{label:"Tipo",value:r=>r.tipo},{label:"Emissão",value:r=>new Date(`${r.data_emissao}T00:00:00`).toLocaleDateString("pt-BR")},{label:"Status",value:r=>r.status}],
  },
  auditorias: {
    title: "Auditorias da Qualidade", subtitle: "Planejamento, realização, constatações e relatório de auditoria.", table: "qualidade_auditorias", icon: ShieldCheck, statusKey: "status", select: "*, obras(nome)",
    fields: [
      { key:"obra_id",label:"Obra",type:"select",required:true }, { key:"titulo",label:"Título",required:true },
      { key:"tipo",label:"Tipo",type:"select",required:true,options:[["interna","Interna"],["externa","Externa"],["cliente","Cliente"],["fornecedor","Fornecedor"]] }, { key:"norma_referencia",label:"Norma / Referência" },
      { key:"escopo",label:"Escopo",type:"textarea",required:true,span:true }, { key:"auditor",label:"Auditor responsável" },
      { key:"data_planejada",label:"Data planejada",type:"date",required:true }, { key:"data_realizada",label:"Data realizada",type:"date" },
      { key:"status",label:"Status",type:"select",required:true,options:[["planejada","Planejada"],["em_andamento","Em andamento"],["concluida","Concluída"],["cancelada","Cancelada"]] },
      { key:"resultado",label:"Resultado",type:"select",options:[["conforme","Conforme"],["parcialmente_conforme","Parcialmente conforme"],["nao_conforme","Não conforme"]] },
      { key:"total_constatacoes",label:"Total de constatações",type:"number" }, { key:"relatorio_url",label:"Link do relatório",type:"url" },
      { key:"observacoes",label:"Observações",type:"textarea",span:true },
    ],
    columns: [{label:"Auditoria",value:r=>r.titulo},{label:"Tipo",value:r=>r.tipo},{label:"Planejada",value:r=>new Date(`${r.data_planejada}T00:00:00`).toLocaleDateString("pt-BR")},{label:"Auditor",value:r=>r.auditor},{label:"Status",value:r=>r.status}],
  },
  fornecedores: {
    title: "Avaliação de Fornecedores", subtitle: "Desempenho por qualidade, prazo, documentação, atendimento e segurança.", table: "qualidade_avaliacoes_fornecedores", icon: Truck, statusKey: "classificacao", select: "*, obras(nome), fornecedores(nome)",
    fields: [
      { key:"obra_id",label:"Obra",type:"select",required:true }, { key:"fornecedor_id",label:"Fornecedor",type:"select",source:"fornecedor",required:true },
      { key:"periodo",label:"Período de avaliação",required:true },
      { key:"nota_qualidade",label:"Qualidade (0–10)",type:"number",required:true }, { key:"nota_prazo",label:"Prazo (0–10)",type:"number",required:true },
      { key:"nota_documentacao",label:"Documentação (0–10)",type:"number",required:true }, { key:"nota_atendimento",label:"Atendimento (0–10)",type:"number",required:true },
      { key:"nota_seguranca",label:"Segurança (0–10)",type:"number",required:true }, { key:"observacoes",label:"Observações",type:"textarea",span:true },
    ],
    columns: [{label:"Fornecedor",value:r=>r.fornecedores?.nome},{label:"Período",value:r=>r.periodo},{label:"Nota final",value:r=>Number(r.nota_final).toFixed(1)},{label:"Qualidade",value:r=>Number(r.nota_qualidade).toFixed(1)},{label:"Classificação",value:r=>r.classificacao}],
  },
};

const statusClass = (status: string) => {
  if (["aprovado","concluida","qualificado","conforme"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["reprovado","bloqueado","nao_conforme","obsoleto"].includes(status)) return "bg-red-100 text-red-700";
  if (["quarentena","condicional","aprovado_com_restricao","parcialmente_conforme"].includes(status)) return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
};

export default function QualidadeRegistros() {
  const { modulo = "" } = useParams(); const config = configs[modulo]; const navigate = useNavigate();
  const [rows,setRows]=useState<any[]>([]); const [obras,setObras]=useState<any[]>([]); const [materiais,setMateriais]=useState<any[]>([]); const [fornecedores,setFornecedores]=useState<any[]>([]);
  const [obraId,setObraId]=useState("todas"); const [search,setSearch]=useState(""); const [loading,setLoading]=useState(true); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<any>(null); const [form,setForm]=useState<Record<string,string>>({}); const [saving,setSaving]=useState(false);

  const load = useCallback(async () => {
    if (!config) return; setLoading(true);
    const [records,worksites,materials,suppliers] = await Promise.all([
      (supabase as any).from(config.table).select(config.select).order("created_at",{ascending:false}),
      (supabase as any).from("obras").select("id,nome").order("nome"),
      (supabase as any).from("materiais_catalogo").select("id,nome,unidade").eq("ativo",true).order("nome"),
      (supabase as any).from("fornecedores").select("id,nome").eq("ativo",true).order("nome"),
    ]);
    if(records.error) toast.error(records.error.message);
    setRows(records.data??[]);setObras(worksites.data??[]);setMateriais(materials.data??[]);setFornecedores(suppliers.data??[]);setLoading(false);
  },[config]);
  useEffect(()=>{load();},[load]);

  if(!config) return <Layout><div className="p-8">Módulo de Qualidade não encontrado.</div></Layout>;
  const Icon=config.icon;
  const filtered=rows.filter(row=>(obraId==="todas"||row.obra_id===obraId)&&(!search||JSON.stringify(row).toLowerCase().includes(search.toLowerCase())));
  const positive=rows.filter(r=>["aprovado","concluida","qualificado"].includes(r[config.statusKey])).length;
  const attention=rows.filter(r=>["reprovado","bloqueado","quarentena","nao_conforme"].includes(r[config.statusKey])).length;

  const startCreate=()=>{const initial:Record<string,string>={};config.fields.forEach(f=>{initial[f.key]=f.type==="date"&&f.required?today():f.key==="resultado"?"pendente":f.key==="status"?(modulo==="documentos"?"rascunho":modulo==="auditorias"?"planejada":""):f.key==="revisao"?"00":f.key.startsWith("nota_")?"10":"";});setForm(initial);setEditing(null);setOpen(true);};
  const startEdit=(row:any)=>{const next:Record<string,string>={};config.fields.forEach(f=>next[f.key]=row[f.key]==null?"":String(row[f.key]));setForm(next);setEditing(row);setOpen(true);};
  const setValue=(key:string,value:string)=>{setForm(prev=>({...prev,[key]:value}));if(key==="material_id"){const material=materiais.find(m=>m.id===value);if(material)setForm(prev=>({...prev,material_id:value,material_nome:material.nome,unidade:material.unidade}));}};
  const save=async()=>{const missing=config.fields.find(f=>f.required&&!String(form[f.key]??"").trim());if(missing){toast.error(`Informe: ${missing.label}`);return;}setSaving(true);const payload:any={};config.fields.forEach(f=>{const value=form[f.key];payload[f.key]=value===""?null:f.type==="number"?Number(value):value;});const query=editing?(supabase as any).from(config.table).update(payload).eq("id",editing.id):(supabase as any).from(config.table).insert(payload);const{error}=await query;setSaving(false);if(error){toast.error(error.message);return;}toast.success(editing?"Registro atualizado":"Registro criado");setOpen(false);load();};
  const remove=async(row:any)=>{if(!window.confirm("Excluir este registro da Qualidade?"))return;const{error}=await(supabase as any).from(config.table).delete().eq("id",row.id);if(error)toast.error(error.message);else{toast.success("Registro excluído");load();}};

  return <Layout><div className="space-y-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={()=>navigate("/qualidade")}><ArrowLeft className="h-4 w-4 mr-1"/>Voltar para Qualidade</Button><div className="flex items-center gap-2"><div className="rounded-lg bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary"/></div><div><h1 className="text-2xl font-bold">{config.title}</h1><p className="text-sm text-muted-foreground">{config.subtitle}</p></div></div></div><Button onClick={startCreate}><Plus className="h-4 w-4 mr-2"/>Novo registro</Button></div>
    <div className="grid grid-cols-3 gap-3"><Card><CardContent className="p-4"><p className="text-2xl font-bold">{rows.length}</p><p className="text-xs text-muted-foreground">Total de registros</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-600">{positive}</p><p className="text-xs text-muted-foreground">Aprovados / concluídos</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-600">{attention}</p><p className="text-xs text-muted-foreground">Exigem atenção</p></CardContent></Card></div>
    <Card><CardContent className="p-4"><div className="flex flex-col gap-3 md:flex-row"><Select value={obraId} onValueChange={setObraId}><SelectTrigger className="md:w-64"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas as obras</SelectItem>{obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar registros..." value={search} onChange={e=>setSearch(e.target.value)}/></div><Button variant="outline" size="icon" onClick={load}><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/></Button></div></CardContent></Card>
    <Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead>Obra</TableHead>{config.columns.map(c=><TableHead key={c.label}>{c.label}</TableHead>)}<TableHead className="w-24 text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{!loading&&filtered.length===0&&<TableRow><TableCell colSpan={config.columns.length+2} className="h-32 text-center text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>}{filtered.map(row=><TableRow key={row.id}><TableCell className="font-medium">{row.obras?.nome??"—"}</TableCell>{config.columns.map(c=>{const value=c.value(row);return <TableCell key={c.label} className="capitalize">{c.label.toLowerCase().includes("status")||c.label.toLowerCase().includes("resultado")||c.label.toLowerCase().includes("classificação")?<Badge className={statusClass(String(value))}>{display(value)}</Badge>:display(value)}</TableCell>})}<TableCell><div className="flex justify-end"><Button variant="ghost" size="icon" onClick={()=>startEdit(row)}><Pencil className="h-4 w-4"/></Button><Button variant="ghost" size="icon" className="text-red-500" onClick={()=>remove(row)}><Trash2 className="h-4 w-4"/></Button></div></TableCell></TableRow>)}</TableBody></Table></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing?"Editar":"Novo"} — {config.title}</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">{config.fields.map(field=><div key={field.key} className={field.span?"md:col-span-2":""}><Label>{field.label}{field.required&&<span className="text-red-500"> *</span>}</Label>{field.type==="textarea"?<Textarea rows={3} value={form[field.key]??""} onChange={e=>setValue(field.key,e.target.value)}/>:field.type==="select"?<Select value={form[field.key]||undefined} onValueChange={v=>setValue(field.key,v)}><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger><SelectContent>{field.key==="obra_id"?obras.map(o=><SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>):field.source==="material"?materiais.map(m=><SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>):field.source==="fornecedor"?fornecedores.map(f=><SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>):field.options?.map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>:<Input type={field.type==="url"?"url":field.type??"text"} min={field.type==="number"?0:undefined} max={field.key.startsWith("nota_")?10:undefined} step={field.type==="number"?"0.01":undefined} value={form[field.key]??""} onChange={e=>setValue(field.key,e.target.value)}/>}</div>)}</div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving?"Salvando...":"Salvar"}</Button></DialogFooter></DialogContent></Dialog>
  </div></Layout>;
}
