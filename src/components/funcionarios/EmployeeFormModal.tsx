import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, ArrowRight, Briefcase, Building2, CheckCircle2, ShieldCheck, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { useCargos } from "@/hooks/useCargos";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useEscalas } from "@/hooks/useEscalas";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Employee = Database["public"]["Tables"]["employees"]["Row"];
type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"];
const schema = z.object({
  nome:z.string().trim().min(2,"Informe o nome completo"), cpf:z.string().min(11,"CPF inválido"), data_nascimento:z.string().optional(), telefone:z.string().optional(),
  email:z.string().email("E-mail inválido"), matricula:z.string().optional(), cargo_id:z.string().min(1,"Cargo é obrigatório"), departamento_id:z.string().min(1,"Departamento é obrigatório"),
  tipo_contrato:z.string().min(1,"Tipo de vínculo é obrigatório"), data_admissao:z.string().min(1,"Data de admissão é obrigatória"), status:z.enum(["ativo","inativo","ferias","licenca"]),
  obra_id:z.string().optional(), escala_tipo_id:z.string().optional(),
});
type FormValues=z.infer<typeof schema>;
const vazio=():FormValues=>({nome:"",cpf:"",data_nascimento:"",telefone:"",email:"",matricula:"",cargo_id:"",departamento_id:"",tipo_contrato:"clt",data_admissao:"",status:"ativo",obra_id:"none",escala_tipo_id:"none"});
const etapas=[{titulo:"Identificação",ajuda:"Dados essenciais",icon:User},{titulo:"Vínculo",ajuda:"Contrato e função",icon:Briefcase},{titulo:"Lotação",ajuda:"Obra e jornada",icon:Building2}];
interface Props{open:boolean;onOpenChange:(open:boolean)=>void;employee?:Employee;onSubmit:(data:EmployeeInsert)=>Promise<Employee|void>}

export const EmployeeFormModal=({open,onOpenChange,employee,onSubmit}:Props)=>{
  const[etapa,setEtapa]=useState(0),[salvando,setSalvando]=useState(false),[photoUrl,setPhotoUrl]=useState(""),[obras,setObras]=useState<any[]>([]);
  const{cargos}=useCargos();const{departamentos}=useDepartamentos();const{escalaTipos}=useEscalas();
  const form=useForm<FormValues>({resolver:zodResolver(schema),defaultValues:vazio()});
  useEffect(()=>{if(!open)return;setEtapa(0);Promise.all([
    supabase.from("obras" as any).select("id,nome,status").order("nome"),
    employee?(supabase as any).from("employee_dados_rh").select("data_nascimento,tipo_contrato").eq("employee_id",employee.id).maybeSingle():Promise.resolve({data:null}),
    employee?supabase.from("obra_funcionarios").select("obra_id").eq("employee_id",employee.id).eq("status",true).maybeSingle():Promise.resolve({data:null}),
  ]).then(([o,rh,lotacao]:any[])=>{setObras(o.data??[]);if(!employee){form.reset(vazio());setPhotoUrl("");return}form.reset({nome:employee.nome??"",cpf:employee.cpf??"",data_nascimento:rh.data?.data_nascimento??"",telefone:employee.telefone??"",email:employee.email??"",matricula:(employee as any).matricula??"",cargo_id:employee.cargo_id??"",departamento_id:employee.departamento_id??"",tipo_contrato:rh.data?.tipo_contrato??"clt",data_admissao:employee.data_admissao??"",status:employee.status as FormValues["status"],obra_id:lotacao.data?.obra_id??"none",escala_tipo_id:employee.escala_tipo_id??"none"});setPhotoUrl(employee.foto_url??"")})},[employee,open,form]);
  const avancar=async()=>{const campos=etapa===0?["nome","cpf","email"] as const:["cargo_id","departamento_id","tipo_contrato","data_admissao"] as const;if(await form.trigger(campos))setEtapa(v=>Math.min(v+1,2))};
  const salvar=async(values:FormValues)=>{setSalvando(true);try{const resultado=await onSubmit({nome:values.nome.trim(),cpf:values.cpf,email:values.email.trim().toLowerCase(),telefone:values.telefone||null,cargo_id:values.cargo_id,departamento_id:values.departamento_id,data_admissao:values.data_admissao,status:values.status,escala_tipo_id:values.escala_tipo_id==="none"?null:values.escala_tipo_id,foto_url:photoUrl||null,obra_id:values.obra_id==="none"?null:values.obra_id} as EmployeeInsert);const id=employee?.id??(resultado as Employee|undefined)?.id;if(id){if(values.matricula.trim()){const{error}=await(supabase as any).from("employees").update({matricula:values.matricula.trim().toUpperCase()}).eq("id",id);if(error)throw error}const{error}=await(supabase as any).from("employee_dados_rh").upsert({employee_id:id,data_nascimento:values.data_nascimento||null,tipo_contrato:values.tipo_contrato,updated_at:new Date().toISOString()},{onConflict:"employee_id"});if(error)throw error}onOpenChange(false)}finally{setSalvando(false)}};
  const resumo=form.watch();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{employee?"Editar colaborador":"Admitir colaborador"}</DialogTitle><DialogDescription>Cadastro funcional em três etapas. Documentos e dados sensíveis ficam no prontuário de RH.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border bg-muted/30">{etapas.map((e,i)=>{const Icon=e.icon;return <button type="button" key={e.titulo} onClick={()=>i<etapa&&setEtapa(i)} className={`flex items-center gap-2 px-3 py-3 text-left ${i===etapa?"bg-background text-primary shadow-sm":i<etapa?"text-emerald-700":"text-muted-foreground"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">{i<etapa?<CheckCircle2 className="h-4 w-4"/>:<Icon className="h-4 w-4"/>}</span><span><b className="block text-sm">{e.titulo}</b><small className="hidden sm:block">{e.ajuda}</small></span></button>})}</div>
    <Form {...form}><form id="employee-form" onSubmit={form.handleSubmit(salvar)} className="space-y-5">
      {etapa===0&&<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
        <F form={form} name="nome" label="Nome completo *" placeholder="Nome conforme documento" autoFocus/><F form={form} name="cpf" label="CPF *" placeholder="000.000.000-00"/><F form={form} name="data_nascimento" label="Data de nascimento" type="date"/><F form={form} name="telefone" label="Telefone" placeholder="(00) 00000-0000"/><F form={form} name="email" label="E-mail corporativo *" type="email" placeholder="nome@empresa.com"/><F form={form} name="matricula" label="Matrícula" placeholder="Gerada se ficar vazia"/>
      </div><PhotoUpload label="Foto para identificação e crachá" value={photoUrl} onChange={url=>setPhotoUrl(url||"")} bucketName="employee-photos" disabled={salvando}/><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><ShieldCheck className="mr-2 inline h-4 w-4"/>Login e aplicativos são liberados somente em Controle de Acesso.</p></div>}
      {etapa===1&&<div className="grid gap-4 sm:grid-cols-2"><S form={form} name="tipo_contrato" label="Tipo de vínculo *" items={[["clt","Empregado CLT"],["temporario","Temporário"],["aprendiz","Aprendiz"],["estagio","Estágio"],["pj","Prestador PJ"],["terceiro","Terceirizado"]]}/><F form={form} name="data_admissao" label="Início do vínculo *" type="date"/><S form={form} name="cargo_id" label="Cargo *" placeholder="Selecione" items={cargos.map(c=>[c.id,c.nome])}/><S form={form} name="departamento_id" label="Departamento *" placeholder="Selecione" items={departamentos.map(d=>[d.id,d.nome])}/><S form={form} name="status" label="Situação" items={[["ativo","Ativo"],["ferias","Férias"],["licenca","Licença"],["inativo","Inativo"]]}/><p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">Cargo e departamento representam a estrutura organizacional e não concedem permissões.</p></div>}
      {etapa===2&&<div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><S form={form} name="obra_id" label="Lotação principal" items={[["none","Sem obra definida"],...obras.map(o=>[o.id,`${o.nome} · ${o.status}`])]}/><S form={form} name="escala_tipo_id" label="Jornada / escala" items={[["none","Sem escala definida"],...escalaTipos.map(e=>[e.id,`${e.nome} (${e.dias_trabalho}x${e.dias_folga})`])]}/></div><div className="rounded-xl border p-4"><h3 className="mb-3 font-semibold">Conferência da admissão</h3><div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Colaborador:</span> {resumo.nome}</p><p><span className="text-muted-foreground">CPF:</span> {resumo.cpf}</p><p><span className="text-muted-foreground">Vínculo:</span> {resumo.tipo_contrato.toUpperCase()}</p><p><span className="text-muted-foreground">Admissão:</span> {resumo.data_admissao||"—"}</p><p><span className="text-muted-foreground">Cargo:</span> {cargos.find(c=>c.id===resumo.cargo_id)?.nome||"—"}</p><p><span className="text-muted-foreground">Obra:</span> {obras.find(o=>o.id===resumo.obra_id)?.nome||"Sem obra"}</p></div></div><p className="text-xs text-muted-foreground">Depois, complete documentos, dados bancários, benefícios e saúde ocupacional no Perfil RH.</p></div>}
    </form></Form><DialogFooter className="flex-row justify-between sm:justify-between"><Button type="button" variant="outline" onClick={()=>etapa?setEtapa(v=>v-1):onOpenChange(false)} disabled={salvando}>{etapa?<><ArrowLeft className="mr-2 h-4 w-4"/>Voltar</>:"Cancelar"}</Button>{etapa<2?<Button type="button" onClick={avancar}>Continuar<ArrowRight className="ml-2 h-4 w-4"/></Button>:<Button type="submit" form="employee-form" disabled={salvando}>{salvando?"Salvando...":employee?"Salvar alterações":"Concluir admissão"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
};

function F({form,name,label,...input}:any){return <FormField control={form.control} name={name} render={({field})=><FormItem><FormLabel>{label}</FormLabel><FormControl><Input {...input} {...field}/></FormControl><FormMessage/></FormItem>}/>}
function S({form,name,label,items,placeholder}:any){return <FormField control={form.control} name={name} render={({field})=><FormItem><FormLabel>{label}</FormLabel><Select value={field.value||"none"} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder={placeholder}/></SelectTrigger></FormControl><SelectContent>{items.map(([v,l]:string[])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>}/>}
