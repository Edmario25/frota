import { useCallback, useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useObras } from '@/hooks/useObras';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { FotoUploader } from '@/components/sms/FotoUploader';
import { DdsParticipants, type DdsEmployee, type DdsParticipant } from '@/components/sms/DdsParticipants';
import { downloadCsv } from '@/lib/exportCsv';
import { ddsLocalDate } from '@/lib/dds';
import { BookOpen, Plus, RefreshCw } from 'lucide-react';

type Sessao = {
  id: string; obra_id: string; tema_id: string | null; tema_livre: string | null;
  tema_titulo: string | null; obra_nome: string | null; data_sessao: string; hora_inicio: string | null;
  condutor: string; duracao_min: number; frente_servico: string | null; observacoes: string | null;
  fotos: string[]; participantes_nomes: string | null; versao: number;
  status: 'rascunho' | 'concluido' | 'cancelado'; total_presentes: number;
};
type Tema = { id: string; titulo: string };
type Presenca = DdsParticipant & { nome: string; presente: boolean; confirmado_em: string | null; registrado_por: string | null };
type Detalhe = { sessao: Sessao; participantes: Presenca[]; historico: { id: string; evento: string; motivo: string | null; criado_em: string; autor_id: string }[] };
type Form = { obra_id: string; tema_id: string; tema_livre: string; data_sessao: string; hora_inicio: string; condutor: string; duracao_min: string; frente_servico: string; observacoes: string; fotos: string[] };
const localDate = ddsLocalDate;
const blank = (obra = ''): Form => ({ obra_id: obra, tema_id: '', tema_livre: '', data_sessao: localDate(), hora_inicio: '', condutor: '', duracao_min: '15', frente_servico: '', observacoes: '', fotos: [] });
const labels = { rascunho: 'Rascunho', concluido: 'Concluído', cancelado: 'Cancelado' };
const db = supabase as any; // RPCs desta migration ainda não constam dos tipos gerados.

export default function SmsDds() {
  const { obras } = useObras();
  const { toast } = useToast();
  const [obra, setObra] = useState('all');
  const [inicio, setInicio] = useState(() => localDate().slice(0, 7) + '-01');
  const [fim, setFim] = useState(localDate);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Sessao[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, concluidos: 0, rascunhos: 0, obras: 0, presencas: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [temas, setTemas] = useState<Tema[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Sessao | null>(null);
  const [form, setForm] = useState<Form>(() => blank());
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detalhe | null>(null);
  const [equipe, setEquipe] = useState<DdsEmployee[]>([]);
  const [selected, setSelected] = useState<DdsParticipant[]>([]);
  const [action, setAction] = useState<'reabrir' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const loadVersion = useRef(0);
  const createId = useRef(crypto.randomUUID());
  const reportError = (message: string) => toast({ title: 'Operação não concluída', description: message, variant: 'destructive' });

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    if (!inicio || !fim || inicio > fim) { setError('Informe um período válido.'); return; }
    setLoading(true); setError('');
    let q = db.from('v_dds_resumo').select('*', { count: 'exact' }).gte('data_sessao', inicio).lte('data_sessao', fim);
    if (obra !== 'all') q = q.eq('obra_id', obra);
    if (status !== 'all') q = q.eq('status', status);
    const [list, indicators] = await Promise.all([
      q.order('data_sessao', { ascending: false }).order('id').range(page * 50, page * 50 + 49),
      db.rpc('dds_indicadores', { p_inicio: inicio, p_fim: fim, p_obra: obra === 'all' ? null : obra }),
    ]);
    if (version !== loadVersion.current) return;
    setError(list.error?.message ?? indicators.error?.message ?? '');
    setRows(list.data ?? []); setTotal(list.count ?? 0);
    if (indicators.data) setStats(indicators.data);
    setLoading(false);
  }, [obra, inicio, fim, status, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    db.from('sms_dds_temas').select('id,titulo').eq('ativo', true).order('titulo')
      .then(({ data, error }: { data: Tema[]; error: { message: string } | null }) => {
        if (error) setError(error.message); else setTemas(data ?? []);
      });
  }, []);

  async function openDetail(s: Sessao) {
    if (busy) return;
    setBusy(true);
    try {
      const [d, team] = await Promise.all([db.rpc('dds_detalhe', { p_id: s.id }), db.rpc('dds_equipe', { p_obra: s.obra_id })]);
      if (d.error || team.error) throw new Error(d.error?.message ?? team.error.message);
      const data = d.data as Detalhe;
      data.sessao = { ...s, ...data.sessao };
      setDetail(data);
      // Mantém participantes históricos visíveis após transferência ou inativação.
      setEquipe(Array.from(new Map([...data.participantes.filter(p => p.presente), ...(team.data ?? [])]
        .map((e: DdsEmployee) => [e.id, { id: e.id, nome: e.nome }])).values()));
      setSelected(data.participantes.filter(p => p.presente).map(p => ({ id: p.id, origem: p.origem === 'qr' ? 'qr' : 'manual' })));
    } catch (e) { reportError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveSession() {
    if (busy) return;
    if (!form.obra_id || (!form.tema_id && !form.tema_livre.trim()) || !form.condutor.trim() || !form.data_sessao ||
        !Number.isInteger(Number(form.duracao_min)) || Number(form.duracao_min) <= 0) {
      reportError('Informe obra, tema, condutor, data e duração válida.'); return;
    }
    setBusy(true);
    const payload = { ...form, tema_id: form.tema_id || null, duracao_min: Number(form.duracao_min), participantes: [] };
    const { error } = editing
      ? await db.rpc('dds_editar', { p_id: editing.id, p_versao: editing.versao, p_dados: payload })
      : await db.rpc('dds_registrar', { p_id: createId.current, p_dados: payload });
    setBusy(false);
    if (error) { reportError(error.message); return; }
    setModal(false); setDetail(null); load();
    toast({ title: 'Rascunho salvo', description: 'Abra os detalhes para registrar presenças e concluir o DDS.' });
  }

  async function saveParticipants() {
    if (!detail || busy) return;
    setBusy(true);
    const { error } = await db.rpc('dds_salvar_presencas', { p_id: detail.sessao.id, p_versao: detail.sessao.versao, p_participantes: selected });
    setBusy(false);
    if (error) { reportError(error.message); return; }
    setDetail(null); load(); toast({ title: 'Presenças salvas com segurança' });
  }

  async function changeStatus(acao: string) {
    if (!detail || busy) return;
    setBusy(true);
    const { error } = await db.rpc('dds_finalizar', { p_id: detail.sessao.id, p_versao: detail.sessao.versao, p_acao: acao, p_motivo: motivo || null });
    setBusy(false);
    if (error) { reportError(error.message); return; }
    setAction(null); setDetail(null); load(); toast({ title: 'DDS atualizado' });
  }

  const dirty = !!detail && selected.map(p => p.id).sort().join(',') !== detail.participantes.filter(p => p.presente).map(p => p.id).sort().join(',');
  const updateFilter = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(0); };

  return <Layout><div className="max-w-screen-xl mx-auto space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="text-teal-600" /> DDS — Diálogo Diário de Segurança</h1>
        <p className="text-muted-foreground text-sm">Sessões, participantes identificados e rastreabilidade por obra.</p></div>
      <Button onClick={() => { setEditing(null); setForm(blank(obra === 'all' ? '' : obra)); createId.current = crypto.randomUUID(); setModal(true); }}><Plus className="h-4 w-4 mr-2" />Registrar DDS</Button>
    </div>
    <div className="flex flex-wrap gap-3 items-end">
      <div><Label>De</Label><Input type="date" value={inicio} onChange={e => updateFilter(setInicio)(e.target.value)} /></div>
      <div><Label>Até</Label><Input type="date" value={fim} onChange={e => updateFilter(setFim)(e.target.value)} /></div>
      <Select value={obra} onValueChange={updateFilter(setObra)}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as obras</SelectItem>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={updateFilter(setStatus)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(labels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Button variant="outline" onClick={load} aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error ? <Card className="p-5 text-red-700" role="alert">Não foi possível carregar o DDS: {error}</Card> : loading ? <p>Carregando…</p> : <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[['Sessões no período', stats.total], ['Concluídas', stats.concluidos], ['Rascunhos', stats.rascunhos], ['Obras com DDS concluído', stats.obras], ['Presenças em DDS concluídos', stats.presencas]].map(([label, value]) => <Card className="p-4" key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><strong className="text-2xl text-teal-700">{value}</strong></Card>)}</div>
      <p className="text-xs text-muted-foreground">Indicadores consideram todas as sessões do período e da obra, independentemente da página e do filtro de status. Presenças são participações, não pessoas únicas.</p>
      <Card className="overflow-x-auto"><Table><TableHeader><TableRow>{['Data', 'Tema / Frente', 'Condutor', 'Obra', 'Participantes', 'Status', ''].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
        {!rows.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum DDS encontrado neste período.</TableCell></TableRow>}
        {rows.map(s => <TableRow key={s.id}><TableCell>{s.data_sessao.split('-').reverse().join('/')}</TableCell><TableCell>{s.tema_titulo || s.tema_livre || 'Tema não informado'}<small className="block text-muted-foreground">{s.frente_servico}</small></TableCell><TableCell>{s.condutor}</TableCell><TableCell>{s.obra_nome}</TableCell><TableCell>{s.total_presentes}</TableCell><TableCell><Badge variant={s.status === 'concluido' ? 'default' : 'outline'}>{labels[s.status]}</Badge></TableCell><TableCell><Button variant="ghost" disabled={busy} onClick={() => openDetail(s)}>Detalhes / Presenças</Button></TableCell></TableRow>)}
      </TableBody></Table></Card>
      <div className="flex gap-3 items-center"><Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page + 1} · {total} sessões</span><Button variant="outline" disabled={(page + 1) * 50 >= total} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>
    </>}

    <Dialog open={modal} onOpenChange={v => { if (!busy) setModal(v); }}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? 'Editar rascunho' : 'Registrar DDS'}</DialogTitle></DialogHeader>
      <Label>Obra *</Label><Select disabled={!!editing?.obra_id} value={form.obra_id} onValueChange={v => setForm(f => ({ ...f, obra_id: v }))}><SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger><SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent></Select>
      <Label>Tema *</Label><Select value={form.tema_id || 'livre'} onValueChange={v => setForm(f => ({ ...f, tema_id: v === 'livre' ? '' : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="livre">Tema livre</SelectItem>{temas.map(t => <SelectItem key={t.id} value={t.id}>{t.titulo}</SelectItem>)}</SelectContent></Select>
      {!form.tema_id && <><Label>Título do tema livre *</Label><Input value={form.tema_livre} onChange={e => setForm(f => ({ ...f, tema_livre: e.target.value }))} /></>}
      <div className="grid grid-cols-2 gap-3">{([['data_sessao', 'Data *', 'date'], ['hora_inicio', 'Horário', 'time'], ['duracao_min', 'Duração (min) *', 'number'], ['frente_servico', 'Frente de serviço', 'text'], ['condutor', 'Condutor *', 'text']] as const).map(([key, label, type]) => <div key={key}><Label>{label}</Label><Input type={type} min={type === 'number' ? 1 : undefined} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></div>)}</div>
      <Label>Conteúdo abordado / Observações</Label><Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
      <Label>Fotos e evidências</Label><FotoUploader folder="dds" urls={form.fotos} onChange={fotos => setForm(f => ({ ...f, fotos }))} maxFiles={6} />
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setModal(false)}>Voltar</Button><Button disabled={busy} onClick={saveSession}>{busy ? 'Salvando…' : 'Salvar rascunho'}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!detail} onOpenChange={v => { if (!v && !busy) setDetail(null); }}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" id="dds-print"><DialogHeader><DialogTitle>DDS — {detail?.sessao.tema_titulo || detail?.sessao.tema_livre || 'Detalhes'}</DialogTitle></DialogHeader>
      {detail && <>
        <p className="text-sm">{detail.sessao.obra_nome} · {detail.sessao.data_sessao} · {detail.sessao.hora_inicio || 'Horário não informado'} · {detail.sessao.duracao_min} min</p>
        <p className="text-sm">Condutor: {detail.sessao.condutor} · Frente: {detail.sessao.frente_servico || 'Não informada'}</p><Badge className="w-fit">{labels[detail.sessao.status]}</Badge>
        <p className="whitespace-pre-wrap text-sm">{detail.sessao.observacoes}</p>
        {detail.sessao.participantes_nomes && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Anotação legada de participantes (não comprova presença individual): {detail.sessao.participantes_nomes}</p>}
        <div className="grid grid-cols-3 gap-2">{detail.sessao.fotos?.filter(url => /^https?:\/\//i.test(url)).map((url, i) => <a href={url} target="_blank" rel="noreferrer" key={i}><img src={url} alt={'Evidência ' + (i + 1)} className="h-28 w-full rounded object-cover" /></a>)}</div>
        <div className="dds-no-print"><DdsParticipants equipe={equipe} value={selected} onChange={setSelected} disabled={busy || detail.sessao.status !== 'rascunho'} /></div>
        <div className="dds-print-list hidden"><h3>Participantes registrados</h3>{detail.participantes.filter(p => p.presente).map(p => <p key={p.id}>{p.nome} — {p.origem === 'qr' ? 'Identificação por crachá QR' : 'Presença informada pelo responsável'}</p>)}</div>
        <div className="flex flex-wrap gap-2 dds-no-print">
          {detail.sessao.status === 'rascunho' && <><Button disabled={busy} onClick={saveParticipants}>Salvar presenças</Button><Button variant="outline" disabled={busy || dirty} onClick={() => changeStatus('concluir')}>Concluir DDS</Button><Button variant="outline" disabled={busy || dirty} onClick={() => { const s = detail.sessao; setEditing(s); setForm({ obra_id: s.obra_id, tema_id: s.tema_id || '', tema_livre: s.tema_livre || '', data_sessao: s.data_sessao, hora_inicio: s.hora_inicio || '', condutor: s.condutor, duracao_min: String(s.duracao_min || 15), frente_servico: s.frente_servico || '', observacoes: s.observacoes || '', fotos: s.fotos || [] }); setDetail(null); setModal(true); }}>Editar dados</Button></>}
          {detail.sessao.status === 'concluido' && <Button variant="outline" disabled={busy} onClick={() => { setAction('reabrir'); setMotivo(''); }}>Reabrir com justificativa</Button>}
          {detail.sessao.status !== 'cancelado' && <Button variant="outline" disabled={busy || dirty} onClick={() => { setAction('cancelar'); setMotivo(''); }}>Cancelar DDS</Button>}
          <Button variant="outline" disabled={dirty} onClick={() => window.print()}>Imprimir / Salvar PDF</Button>
          <Button variant="outline" disabled={dirty} onClick={() => downloadCsv(['Funcionário', 'Origem', 'Registrado em', 'Responsável (ID)'], detail.participantes.filter(p => p.presente).map(p => [p.nome, p.origem, p.confirmado_em, p.registrado_por]), 'dds-' + detail.sessao.id)}>Exportar presenças</Button>
        </div>
        {dirty && <p className="text-sm text-amber-700 dds-no-print">Salve as presenças antes de concluir ou exportar.</p>}
        <details className="dds-no-print"><summary className="cursor-pointer font-medium">Histórico de alterações</summary>{detail.historico.map(h => <p key={h.id} className="text-xs border-b py-2">{new Date(h.criado_em).toLocaleString('pt-BR')} · {h.evento} · {h.motivo || '—'}<span className="block text-muted-foreground">Responsável: {h.autor_id}</span></p>)}</details>
      </>}
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={v => { if (!v && !busy) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{action === 'reabrir' ? 'Reabrir DDS' : 'Cancelar DDS'}</DialogTitle></DialogHeader><Label>Justificativa obrigatória</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} /><p className="text-xs text-muted-foreground">Operação restrita à gestão. O histórico será preservado.</p><DialogFooter><Button disabled={busy || motivo.trim().length < 5} onClick={() => changeStatus(action!)}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
    {detail && <style>{'@media print { body * { visibility: hidden; } #dds-print, #dds-print * { visibility: visible; } #dds-print { position: absolute !important; transform: none !important; inset: 0 !important; max-height: none !important; max-width: none !important; width: 100% !important; overflow: visible !important; border: none !important; } #dds-print .dds-no-print, #dds-print button { display: none !important; } #dds-print .dds-print-list { display: block !important; } }'}</style>}
  </div></Layout>;
}
