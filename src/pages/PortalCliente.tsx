import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe, Plus, Pencil, Trash2, Image, FileText, Bell,
  Settings, Copy, Check, Star, Eye, EyeOff, ChevronRight,
  ChevronDown, Link, Download, RefreshCw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type Obra = { id: string; nome: string };

type PortalConfig = {
  id: string; obra_id: string; titulo_portal: string | null;
  mensagem_boas_vindas: string | null; exibir_cronograma: boolean;
  exibir_fotos: boolean; exibir_documentos: boolean; exibir_financeiro: boolean;
  token_acesso: string | null; token_ativo: boolean; token_expires_at: string | null;
};

type Foto = {
  id: string; obra_id: string; url: string; thumbnail: string | null;
  titulo: string | null; categoria: string; data_foto: string; destaque: boolean;
};

type Documento = {
  id: string; obra_id: string; nome: string; descricao: string | null;
  categoria: string; url: string; tamanho_kb: number | null; visivel: boolean; data_doc: string;
};

type Atualizacao = {
  id: string; obra_id: string; titulo: string; corpo: string | null;
  tipo: string; data_evento: string; publicado: boolean;
};

type PortalResumo = {
  obra_id: string; obra_nome: string; obra_status: string;
  titulo_portal: string | null; mensagem_boas_vindas: string | null;
  exibir_cronograma: boolean; exibir_fotos: boolean; exibir_documentos: boolean; exibir_financeiro: boolean;
  token_acesso: string | null; token_ativo: boolean;
  perc_fisico_realizado: number; total_fotos: number; total_documentos: number;
  ultima_atualizacao: string | null; token_expires_at?: string | null;
  ultimo_acesso?: string | null; total_acessos?: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const CAT_FOTOS: Record<string, string> = {
  geral: "Geral", fundacoes: "Fundações", estrutura: "Estrutura",
  alvenaria: "Alvenaria", instalacoes: "Instalações", acabamento: "Acabamento", area_externa: "Área Externa",
};

const CAT_DOCS: Record<string, string> = {
  geral: "Geral", contrato: "Contrato", projeto: "Projeto",
  cronograma: "Cronograma", relatorio: "Relatório", certificacao: "Certificação", outro: "Outro",
};

const TIPO_ATU: Record<string, { label: string; cls: string }> = {
  progresso: { label: "Progresso",  cls: "bg-blue-100 text-blue-700"   },
  alerta:    { label: "Alerta",     cls: "bg-red-100 text-red-700"     },
  marco:     { label: "Marco",      cls: "bg-emerald-100 text-emerald-700" },
  geral:     { label: "Geral",      cls: "bg-slate-100 text-slate-600" },
};

// ─── Modal: Configurações do Portal ───────────────────────────────────────

function ConfigModal({
  open, onClose, onSaved, obras, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; editing: PortalConfig | null;
}) {
  const { toast } = useToast();
  const blank = {
    obra_id: "", titulo_portal: "", mensagem_boas_vindas: "",
    exibir_cronograma: true, exibir_fotos: true, exibir_documentos: true, exibir_financeiro: false, token_expires_at: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id,
          titulo_portal: editing.titulo_portal ?? "",
          mensagem_boas_vindas: editing.mensagem_boas_vindas ?? "",
          exibir_cronograma: editing.exibir_cronograma,
          exibir_fotos: editing.exibir_fotos,
          exibir_documentos: editing.exibir_documentos,
          exibir_financeiro: editing.exibir_financeiro,
          token_expires_at: editing.token_expires_at?.slice(0, 10) ?? "",
        });
      } else { setF({ ...blank, obra_id: obras[0]?.id ?? "" }); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id) { toast({ title: "Selecione a obra", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      obra_id: f.obra_id,
      titulo_portal: f.titulo_portal || null,
      mensagem_boas_vindas: f.mensagem_boas_vindas || null,
      exibir_cronograma: f.exibir_cronograma,
      exibir_fotos: f.exibir_fotos,
      exibir_documentos: f.exibir_documentos,
      exibir_financeiro: f.exibir_financeiro,
      token_expires_at: f.token_expires_at ? `${f.token_expires_at}T23:59:59-03:00` : null,
    };
    const { error } = await (supabase as any)
      .from("portal_config")
      .upsert(payload, { onConflict: "obra_id" });
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Portal configurado com sucesso" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Configurar Portal</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Obra *</Label>
            <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título do Portal</Label>
            <Input value={f.titulo_portal} onChange={e => set("titulo_portal", e.target.value)} placeholder="ex: Acompanhamento — Torre A" />
          </div>
          <div>
            <Label>Mensagem de Boas-Vindas</Label>
            <Textarea value={f.mensagem_boas_vindas} onChange={e => set("mensagem_boas_vindas", e.target.value)} rows={2} />
          </div>
          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-semibold">Seções visíveis ao cliente</p>
            {[
              { key: "exibir_cronograma",  label: "Cronograma e avanço físico" },
              { key: "exibir_fotos",       label: "Galeria de fotos" },
              { key: "exibir_documentos",  label: "Documentos para download" },
              { key: "exibir_financeiro",  label: "Resumo financeiro (orçado/realizado)" },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between">
                <Label className="font-normal">{item.label}</Label>
                <Switch
                  checked={f[item.key as keyof typeof f] as boolean}
                  onCheckedChange={v => set(item.key, v)}
                />
              </div>
            ))}
          </div>
          <div>
            <Label>Validade do link (opcional)</Label>
            <Input type="date" value={f.token_expires_at} onChange={e => set("token_expires_at", e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Sem data, o acesso permanece válido até ser desativado ou renovado.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Foto ──────────────────────────────────────────────────────────

function FotoModal({
  open, onClose, onSaved, obras, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; editing: Foto | null;
}) {
  const { toast } = useToast();
  const blank = { obra_id: "", url: "", thumbnail: "", titulo: "", categoria: "geral", data_foto: new Date().toISOString().slice(0, 10), destaque: false };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id, url: editing.url, thumbnail: editing.thumbnail ?? "",
          titulo: editing.titulo ?? "", categoria: editing.categoria,
          data_foto: editing.data_foto, destaque: editing.destaque,
        });
      } else { setF({ ...blank, obra_id: obras[0]?.id ?? "" }); }
      setFile(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || (!f.url && !file)) { toast({ title: "Selecione a obra e uma imagem", variant: "destructive" }); return; }
    setSaving(true);
    let fileUrl = f.url;
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${f.obra_id}/fotos/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("portal-cliente").upload(path, file, { contentType: file.type });
      if (uploadError) { setSaving(false); toast({ title:"Erro no envio da imagem", description:uploadError.message, variant:"destructive" }); return; }
      fileUrl = supabase.storage.from("portal-cliente").getPublicUrl(path).data.publicUrl;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      obra_id: f.obra_id, url: fileUrl, thumbnail: f.thumbnail || null,
      titulo: f.titulo || null, categoria: f.categoria, data_foto: f.data_foto,
      destaque: f.destaque, registrado_por: user?.id ?? null,
    };
    const q = editing
      ? (supabase as any).from("portal_fotos").update(payload).eq("id", editing.id)
      : (supabase as any).from("portal_fotos").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Foto atualizada" : "Foto adicionada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar Foto" : "Adicionar Foto"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Obra *</Label>
            <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-dashed p-3">
            <Label>Enviar imagem *</Label>
            <Input className="mt-2" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/>
            {editing&&<p className="mt-1 text-xs text-muted-foreground">Deixe vazio para manter a imagem atual.</p>}
          </div>
          <div>
            <Label>URL Thumbnail (opcional)</Label>
            <Input value={f.thumbnail} onChange={e => set("thumbnail", e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Título</Label>
              <Input value={f.titulo} onChange={e => set("titulo", e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={f.data_foto} onChange={e => set("data_foto", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={v => set("categoria", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT_FOTOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch checked={f.destaque} onCheckedChange={v => set("destaque", v)} />
              <Label className="font-normal">Foto de destaque</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Documento ─────────────────────────────────────────────────────

function DocumentoModal({
  open, onClose, onSaved, obras, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; editing: Documento | null;
}) {
  const { toast } = useToast();
  const blank = { obra_id: "", nome: "", descricao: "", categoria: "geral", url: "", tamanho_kb: "", visivel: true, data_doc: new Date().toISOString().slice(0, 10) };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id, nome: editing.nome, descricao: editing.descricao ?? "",
          categoria: editing.categoria, url: editing.url,
          tamanho_kb: editing.tamanho_kb != null ? String(editing.tamanho_kb) : "",
          visivel: editing.visivel, data_doc: editing.data_doc,
        });
      } else { setF({ ...blank, obra_id: obras[0]?.id ?? "" }); }
      setFile(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.nome || (!f.url && !file)) { toast({ title: "Obra, nome e arquivo são obrigatórios", variant: "destructive" }); return; }
    setSaving(true);
    let fileUrl=f.url; let fileSize=f.tamanho_kb;
    if(file){
      const ext=file.name.split(".").pop()?.toLowerCase()||"bin";
      const path=`${f.obra_id}/documentos/${crypto.randomUUID()}.${ext}`;
      const {error:uploadError}=await supabase.storage.from("portal-cliente").upload(path,file,{contentType:file.type});
      if(uploadError){setSaving(false);toast({title:"Erro no envio do documento",description:uploadError.message,variant:"destructive"});return;}
      fileUrl=supabase.storage.from("portal-cliente").getPublicUrl(path).data.publicUrl;
      fileSize=String(Math.ceil(file.size/1024));
    }
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      obra_id: f.obra_id, nome: f.nome, descricao: f.descricao || null,
      categoria: f.categoria, url: fileUrl,
      tamanho_kb: fileSize ? parseInt(fileSize as string) : null,
      visivel: f.visivel, data_doc: f.data_doc, publicado_por: user?.id ?? null,
    };
    const q = editing
      ? (supabase as any).from("portal_documentos").update(payload).eq("id", editing.id)
      : (supabase as any).from("portal_documentos").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Documento atualizado" : "Documento publicado" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar Documento" : "Publicar Documento"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Obra *</Label>
            <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do Documento *</Label>
            <Input value={f.nome} onChange={e => set("nome", e.target.value)} placeholder="ex: Projeto Executivo Rev. 2" />
          </div>
          <div className="rounded-lg border border-dashed p-3">
            <Label>Enviar documento *</Label>
            <Input className="mt-2" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setFile(e.target.files?.[0]??null)}/>
            {editing&&<p className="mt-1 text-xs text-muted-foreground">Deixe vazio para manter o documento atual.</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={v => set("categoria", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CAT_DOCS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={f.data_doc} onChange={e => set("data_doc", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={f.descricao} onChange={e => set("descricao", e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={f.visivel} onCheckedChange={v => set("visivel", v)} />
            <Label className="font-normal">Visível ao cliente</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Atualização / Diário ──────────────────────────────────────────

function AtualizacaoModal({
  open, onClose, onSaved, obras, editing,
}: {
  open: boolean; onClose: () => void; onSaved: () => void;
  obras: Obra[]; editing: Atualizacao | null;
}) {
  const { toast } = useToast();
  const blank = { obra_id: "", titulo: "", corpo: "", tipo: "progresso", data_evento: new Date().toISOString().slice(0, 10), publicado: true };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setF({
          obra_id: editing.obra_id, titulo: editing.titulo, corpo: editing.corpo ?? "",
          tipo: editing.tipo, data_evento: editing.data_evento, publicado: editing.publicado,
        });
      } else { setF({ ...blank, obra_id: obras[0]?.id ?? "" }); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.obra_id || !f.titulo) { toast({ title: "Obra e título são obrigatórios", variant: "destructive" }); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      obra_id: f.obra_id, titulo: f.titulo, corpo: f.corpo || null,
      tipo: f.tipo, data_evento: f.data_evento, publicado: f.publicado, autor_id: user?.id ?? null,
    };
    const q = editing
      ? (supabase as any).from("portal_atualizacoes").update(payload).eq("id", editing.id)
      : (supabase as any).from("portal_atualizacoes").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Atualização editada" : "Atualização publicada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Editar Atualização" : "Nova Atualização"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Obra *</Label>
            <Select value={f.obra_id} onValueChange={v => set("obra_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título *</Label>
            <Input value={f.titulo} onChange={e => set("titulo", e.target.value)} placeholder="ex: Concretagem da laje do 3º pavimento concluída" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={f.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_ATU).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={f.data_evento} onChange={e => set("data_evento", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Detalhes</Label>
            <Textarea value={f.corpo} onChange={e => set("corpo", e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={f.publicado} onCheckedChange={v => set("publicado", v)} />
            <Label className="font-normal">Publicado (visível ao cliente)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Painel de Portais ────────────────────────────────────────────────

function PainelTab({
  obras, obraId, refresh, triggerRefresh,
}: { obras: Obra[]; obraId: string; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<PortalResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<PortalConfig | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if(!obraId){setData([]);return;}
    setLoading(true);
    let summary=await (supabase as any).from("v_portal_resumo_seguro").select("*").eq("obra_id",obraId);
    // Compatibilidade enquanto a migração do portal seguro ainda não foi aplicada.
    if(summary.error) summary=await (supabase as any).from("v_portal_resumo").select("*").eq("obra_id",obraId);
    const configs=await (supabase as any).from("portal_config").select("*").eq("obra_id",obraId);
    const selectedWork=obras.find(o=>o.id===obraId);
    const fallback:PortalResumo={
      obra_id:obraId,obra_nome:selectedWork?.nome??"Obra",obra_status:"",
      titulo_portal:null,mensagem_boas_vindas:null,exibir_cronograma:true,exibir_fotos:true,
      exibir_documentos:true,exibir_financeiro:false,token_acesso:null,token_ativo:false,
      perc_fisico_realizado:0,total_fotos:0,total_documentos:0,ultima_atualizacao:null,
    };
    const row=(summary.data?.[0]??fallback) as PortalResumo;
    setData([{...row,...(configs.data?.[0]??{})}]);
    if(summary.error) toast({title:"Não foi possível carregar os indicadores",description:summary.error.message,variant:"destructive"});
    setLoading(false);
  }, [obraId,obras,toast]);

  useEffect(() => { load(); }, [load, refresh]);

  const copyLink = async (token: string | null, id: string) => {
    if (!token) return;
    const url = `${window.location.origin}/portal-publico/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copie o link do portal:",url); }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Link copiado!" });
  };

  const toggleToken = async (obraId: string, atual: boolean) => {
    await (supabase as any).from("portal_config").update({ token_ativo: !atual }).eq("obra_id", obraId);
    triggerRefresh();
  };

  const rotateToken = async (targetObraId:string) => {
    if(!confirm("Gerar um novo link? O endereço anterior deixará de funcionar imediatamente.")) return;
    const {data:token,error}=await (supabase as any).rpc("rotate_portal_token",{target_obra_id:targetObraId});
    if(error){toast({title:"Não foi possível renovar o link",description:error.message,variant:"destructive"});return;}
    await copyLink(token,targetObraId); triggerRefresh();
  };

  return (
    <div className="space-y-4">
      <div><h3 className="font-semibold text-sm">Portal da obra selecionada</h3><p className="text-xs text-muted-foreground">Configure o conteúdo e compartilhe o acesso externo com o cliente.</p></div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="space-y-3">
          {data.map(p => {
            const perc = Number(p.perc_fisico_realizado ?? 0);
            const hasConfig = !!p.token_acesso;
            const expired = !!p.token_expires_at && new Date(p.token_expires_at) < new Date();
            return (
              <Card key={p.obra_id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{p.obra_nome}</span>
                        {hasConfig ? (
                          <Badge className={p.token_ativo&&!expired ? "bg-green-100 text-green-700 border-0" : expired ? "bg-amber-100 text-amber-700 border-0" : "bg-slate-100 text-slate-600 border-0"}>
                            {expired ? "Link expirado" : p.token_ativo ? "Portal Ativo" : "Portal Inativo"}
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 border-0">Sem portal</Badge>
                        )}
                      </div>
                      {p.titulo_portal && <p className="text-xs text-muted-foreground mt-0.5">{p.titulo_portal}</p>}
                      {/* Progresso */}
                      <div className="flex items-center gap-2 mt-2">
                        <Progress value={perc} className="h-1.5 flex-1 max-w-48" />
                        <span className="text-xs font-semibold">{perc}% físico</span>
                      </div>
                      {/* Stats */}
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>🖼 {p.total_fotos} fotos</span>
                        <span>📄 {p.total_documentos} docs</span>
                        {p.ultima_atualizacao && <span>📅 últ. atualização {p.ultima_atualizacao}</span>}
                        {hasConfig && <span>👁 {p.total_acessos??0} acessos</span>}
                      </div>
                      {p.ultimo_acesso&&<p className="mt-1 text-[11px] text-muted-foreground">Último acesso: {new Date(p.ultimo_acesso).toLocaleString("pt-BR")}</p>}
                      {/* Seções ativas */}
                      {hasConfig && (
                        <div className="flex gap-1 mt-2">
                          {p.exibir_cronograma && <Badge variant="outline" className="text-[10px]">Cronograma</Badge>}
                          {p.exibir_fotos      && <Badge variant="outline" className="text-[10px]">Fotos</Badge>}
                          {p.exibir_documentos && <Badge variant="outline" className="text-[10px]">Documentos</Badge>}
                          {p.exibir_financeiro && <Badge variant="outline" className="text-[10px]">Financeiro</Badge>}
                        </div>
                      )}
                    </div>
                    {/* Ações */}
                    <div className="flex flex-col gap-2 items-end">
                      <Button size="sm" variant="outline"
                        onClick={() => { setEditing(hasConfig ? { ...p, id: "" } as PortalConfig : null); setModal(true); }}>
                        <Settings className="h-3 w-3 mr-1" /> Configurar
                      </Button>
                      {hasConfig && (
                        <>
                          <Button size="sm" variant="outline"
                            onClick={() => copyLink(p.token_acesso, p.obra_id)}>
                            {copiedId === p.obra_id
                              ? <><Check className="h-3 w-3 mr-1 text-green-600" /> Copiado</>
                              : <><Copy className="h-3 w-3 mr-1" /> Copiar Link</>}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={()=>window.open(`/portal-publico/${p.token_acesso}`,"_blank")}><Eye className="h-3 w-3 mr-1"/>Visualizar</Button>
                          <Button size="sm" variant="ghost" className="text-xs" onClick={()=>rotateToken(p.obra_id)}><RefreshCw className="h-3 w-3 mr-1"/>Renovar link</Button>
                          <Button size="sm" variant="ghost" className="text-xs"
                            onClick={() => toggleToken(p.obra_id, p.token_ativo)}>
                            {p.token_ativo
                              ? <><EyeOff className="h-3 w-3 mr-1" /> Desativar</>
                              : <><Eye className="h-3 w-3 mr-1" /> Ativar</>}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {data.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma obra disponível para configurar.
            </p>
          )}
        </div>
      )}

      <ConfigModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras.filter(o=>o.id===obraId)} editing={editing}
      />
    </div>
  );
}

// ─── Tab: Fotos ────────────────────────────────────────────────────────────

function FotosTab({
  obraId, obras, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Foto | null>(null);
  const [filterCat, setFilterCat] = useState("todas");

  const load = useCallback(async () => {
    if (!obraId) { setFotos([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("portal_fotos").select("*").eq("obra_id", obraId).order("data_foto", { ascending: false });
    setFotos(data ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const del = async (id: string) => {
    if (!confirm("Excluir foto?")) return;
    await (supabase as any).from("portal_fotos").delete().eq("id", id);
    toast({ title: "Foto removida" });
    triggerRefresh();
  };

  const toggleDestaque = async (foto: Foto) => {
    await (supabase as any).from("portal_fotos").update({ destaque: !foto.destaque }).eq("id", foto.id);
    triggerRefresh();
  };

  const filtradas = filterCat === "todas" ? fotos : fotos.filter(f => f.categoria === filterCat);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {Object.entries(CAT_FOTOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar Foto
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma foto cadastrada.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtradas.map(f => (
            <div key={f.id} className="border rounded-lg overflow-hidden group relative">
              <div className="aspect-video bg-muted relative overflow-hidden">
                <img
                  src={f.thumbnail ?? f.url}
                  alt={f.titulo ?? "foto"}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {f.destaque && (
                  <span className="absolute top-1 left-1 bg-amber-400 text-white rounded-full p-0.5">
                    <Star className="h-3 w-3" />
                  </span>
                )}
                {/* Overlay ações */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="icon" variant="secondary" className="h-7 w-7"
                    onClick={() => { setEditing(f); setModal(true); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="secondary" className="h-7 w-7"
                    onClick={() => toggleDestaque(f)} title="Toggle destaque">
                    <Star className={`h-3 w-3 ${f.destaque ? "text-amber-500" : ""}`} />
                  </Button>
                  <Button size="icon" variant="destructive" className="h-7 w-7"
                    onClick={() => del(f.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs font-medium truncate">{f.titulo ?? "Sem título"}</p>
                <p className="text-[10px] text-muted-foreground">{CAT_FOTOS[f.categoria]} · {f.data_foto}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <FotoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} editing={editing}
      />
    </div>
  );
}

// ─── Tab: Documentos ──────────────────────────────────────────────────────

function DocumentosTab({
  obraId, obras, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Documento | null>(null);

  const load = useCallback(async () => {
    if (!obraId) { setDocs([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("portal_documentos").select("*").eq("obra_id", obraId).order("data_doc", { ascending: false });
    setDocs(data ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const del = async (id: string) => {
    if (!confirm("Remover documento?")) return;
    await (supabase as any).from("portal_documentos").delete().eq("id", id);
    toast({ title: "Documento removido" });
    triggerRefresh();
  };

  const toggleVisivel = async (doc: Documento) => {
    await (supabase as any).from("portal_documentos").update({ visivel: !doc.visivel }).eq("id", doc.id);
    triggerRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Publicar Documento
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Visível</TableHead>
                <TableHead>Link</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum documento publicado.
                  </TableCell>
                </TableRow>
              )}
              {docs.map(d => (
                <TableRow key={d.id} className={!d.visivel ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="font-medium text-sm">{d.nome}</div>
                    {d.descricao && <div className="text-xs text-muted-foreground">{d.descricao}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{CAT_DOCS[d.categoria]}</Badge></TableCell>
                  <TableCell className="text-sm">{d.data_doc}</TableCell>
                  <TableCell className="text-sm">
                    {d.tamanho_kb ? `${(d.tamanho_kb / 1024).toFixed(1)} MB` : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch checked={d.visivel} onCheckedChange={() => toggleVisivel(d)} />
                  </TableCell>
                  <TableCell>
                    <a href={d.url} target="_blank" rel="noreferrer">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <Download className="h-3 w-3" />
                      </Button>
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditing(d); setModal(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                        onClick={() => del(d.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DocumentoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} editing={editing}
      />
    </div>
  );
}

// ─── Tab: Atualizações / Diário ────────────────────────────────────────────

function AtualizacoesTab({
  obraId, obras, refresh, triggerRefresh,
}: { obraId: string; obras: Obra[]; refresh: number; triggerRefresh: () => void }) {
  const { toast } = useToast();
  const [atus, setAtus] = useState<Atualizacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Atualizacao | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!obraId) { setAtus([]); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("portal_atualizacoes").select("*").eq("obra_id", obraId).order("data_evento", { ascending: false });
    setAtus(data ?? []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load, refresh]);

  const del = async (id: string) => {
    if (!confirm("Excluir atualização?")) return;
    await (supabase as any).from("portal_atualizacoes").delete().eq("id", id);
    toast({ title: "Removida" });
    triggerRefresh();
  };

  const togglePublicado = async (atu: Atualizacao) => {
    await (supabase as any).from("portal_atualizacoes").update({ publicado: !atu.publicado }).eq("id", atu.id);
    triggerRefresh();
  };

  const toggle = (id: string) => {
    const s = new Set(expanded);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setExpanded(s);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Atualização
        </Button>
      </div>

      {!obraId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecione uma obra.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : atus.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma atualização publicada.</p>
      ) : (
        <div className="relative ml-4 border-l-2 border-border pl-6 space-y-4">
          {atus.map(a => {
            const ti = TIPO_ATU[a.tipo] ?? TIPO_ATU.geral;
            const isOpen = expanded.has(a.id);
            return (
              <div key={a.id} className={`relative ${!a.publicado ? "opacity-50" : ""}`}>
                {/* Dot na timeline */}
                <span className="absolute -left-[1.55rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${ti.cls} border-0 text-xs`}>{ti.label}</Badge>
                      <span className="font-medium text-sm">{a.titulo}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{a.data_evento}</span>
                      {a.corpo && (
                        <button onClick={() => toggle(a.id)} className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                      <Switch checked={a.publicado} onCheckedChange={() => togglePublicado(a)} />
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => { setEditing(a); setModal(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                        onClick={() => del(a.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {isOpen && a.corpo && (
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{a.corpo}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AtualizacaoModal
        open={modal} onClose={() => setModal(false)}
        onSaved={() => { setModal(false); triggerRefresh(); }}
        obras={obras} editing={editing}
      />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function PortalCliente() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const triggerRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("obras").select("id, nome").order("nome");
      setObras(data ?? []);
      if (data?.length) setObraId(data[0].id);
    })();
  }, []);

  return (
    <Layout>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-cyan-100 flex items-center justify-center">
              <Globe className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Portal do Cliente</h1>
              <p className="text-sm text-muted-foreground">Gerencie o que o cliente vê da sua obra</p>
            </div>
          </div>
          <Select value={obraId} onValueChange={setObraId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione a obra" />
            </SelectTrigger>
            <SelectContent>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="painel">
          <TabsList className="mb-4">
            <TabsTrigger value="painel">
              <Link className="h-3.5 w-3.5 mr-1.5" /> Portais
            </TabsTrigger>
            <TabsTrigger value="fotos">
              <Image className="h-3.5 w-3.5 mr-1.5" /> Fotos
            </TabsTrigger>
            <TabsTrigger value="documentos">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="atualizacoes">
              <Bell className="h-3.5 w-3.5 mr-1.5" /> Atualizações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="painel">
            <PainelTab obras={obras} obraId={obraId} refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>

          <TabsContent value="fotos">
            <FotosTab obraId={obraId} obras={obras.filter(o=>o.id===obraId)} refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>

          <TabsContent value="documentos">
            <DocumentosTab obraId={obraId} obras={obras.filter(o=>o.id===obraId)} refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>

          <TabsContent value="atualizacoes">
            <AtualizacoesTab obraId={obraId} obras={obras.filter(o=>o.id===obraId)} refresh={refresh} triggerRefresh={triggerRefresh} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
