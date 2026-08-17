import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  QrCode, CheckCircle2, AlertTriangle, LogOut, RefreshCw,
  Users, ChevronRight, Camera, X, UserCheck, Clock,
  Building2, CalendarDays, ArrowLeft, Search, Sun, Moon,
  ClipboardList, Zap, Menu, Loader2, WifiOff, Upload, CloudOff,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Screen = "login" | "home" | "scanner" | "confirm" | "lista" | "sucesso";

interface Obra { id: string; nome: string; }
interface Funcionario {
  id: string; nome: string; matricula: string | null; cargo: string | null;
  foto_url: string | null; departamento: string | null;
}
// Apontamento vem da tabela efetivo_ponto (integração com Efetivo e Ponto)
interface Apontamento {
  id: string;
  employee_id: string;
  frente: string | null;
  horas_trabalhadas: number | null;
  horas_extras: number;
  ausencia: boolean;
  fonte: string;
  created_at: string;
  employees?: { nome: string; foto_url: string | null; cargos?: { nome: string } | null };
}

// ─── Cache offline ───────────────────────────────────────────────────────────
interface CachedEmp {
  id: string; nome: string; cargo: string | null; foto_url: string | null;
}
interface PendingItem {
  localId: string;
  obra_id: string; obra_nome: string;
  employee_id: string; employee_nome: string; employee_cargo: string | null;
  data: string; frente: string | null;
  horas_trabalhadas: number; horas_extras: number;
  motivo_ausencia: string | null;
  registrado_por: string | null;
  created_at: string;
}

const CACHE_TTL = 8 * 60 * 60 * 1000; // 8h
const OfflineDB = {
  empKey:  (id: string) => `campo_emp_${id}`,
  PENDING: "campo_pending",

  getEmps(obraId: string): CachedEmp[] {
    try {
      const raw = localStorage.getItem(OfflineDB.empKey(obraId));
      if (!raw) return [];
      const { emps, ts } = JSON.parse(raw);
      return Date.now() - ts < CACHE_TTL ? emps : [];
    } catch { return []; }
  },
  setEmps(obraId: string, emps: CachedEmp[]) {
    localStorage.setItem(OfflineDB.empKey(obraId), JSON.stringify({ emps, ts: Date.now() }));
  },
  getCacheTs(obraId: string): number | null {
    try {
      const raw = localStorage.getItem(OfflineDB.empKey(obraId));
      return raw ? JSON.parse(raw).ts : null;
    } catch { return null; }
  },
  getPending(): PendingItem[] {
    try { return JSON.parse(localStorage.getItem(OfflineDB.PENDING) ?? "[]"); }
    catch { return []; }
  },
  addPending(item: PendingItem) {
    const list = OfflineDB.getPending();
    list.push(item);
    localStorage.setItem(OfflineDB.PENDING, JSON.stringify(list));
  },
  removePending(ids: string[]) {
    const list = OfflineDB.getPending().filter(i => !ids.includes(i.localId));
    localStorage.setItem(OfflineDB.PENDING, JSON.stringify(list));
  },
  hasDuplicate(obraId: string, empId: string, dt: string) {
    return OfflineDB.getPending().some(
      i => i.obra_id === obraId && i.employee_id === empId && i.data === dt
    );
  },
};

const FRENTES_PADRAO = ["Fundação","Estrutura","Alvenaria","Instalações Elétricas",
  "Instalações Hidráulicas","Acabamento","Terraplanagem","Paisagismo","Outro"];
const ATIVIDADES_PADRAO = ["Operador","Servente","Pedreiro","Eletricista","Encanador",
  "Carpinteiro","Armador","Motorista","Vigilante","Encarregado","Outro"];

const today = () => format(new Date(), "yyyy-MM-dd");
const fmtHora = (d: string) => format(new Date(d), "HH:mm", { locale: ptBR });
const fmtDataBR = (d: string) => format(new Date(d + "T12:00"), "EEEE, dd/MM/yyyy", { locale: ptBR });

// ─── App Principal ────────────────────────────────────────────────────────────
export default function AppCampo() {
  const [screen,     setScreen]    = useState<Screen>("login");
  const [user,       setUser]      = useState<any>(null);
  const [obras,      setObras]     = useState<Obra[]>([]);
  const [obraId,     setObraId]    = useState("");
  const [obra,       setObra]      = useState<Obra | null>(null);
  const [data,       setData]      = useState(today());
  const [loading,    setLoading]   = useState(true);

  // Scanner
  const [scanError,  setScanError]  = useState("");
  const [scanning,   setScanning]   = useState(false);

  // Confirmação
  const [func,       setFunc]       = useState<Funcionario | null>(null);
  const [frente,     setFrente]     = useState("");
  const [atividade,  setAtividade]  = useState("");
  const [turno,      setTurno]      = useState("dia");
  const [horasNorm,  setHorasNorm]  = useState("8");
  const [horasExtra, setHorasExtra] = useState("0");
  const [obs,        setObs]        = useState("");
  const [saving,     setSaving]     = useState(false);

  // Lista
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);

  // Offline
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [pending,      setPending]      = useState<PendingItem[]>(OfflineDB.getPending());
  const [syncing,      setSyncing]      = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [cacheTs,      setCacheTs]      = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchObras();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchObras();
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Rede: online/offline ──────────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Ao recuperar sinal, sincroniza automaticamente
      syncPendingItems();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function fetchObras() {
    // Busca o employee vinculado ao usuário logado
    const { data: { user: u } } = await supabase.auth.getUser();
    const { data: emp } = await (supabase as any)
      .from("employees")
      .select("id")
      .eq("user_id", u?.id)
      .maybeSingle();

    if (emp?.id) {
      // Apontador de campo: somente obras onde está alocado e ativo
      const { data: links } = await (supabase as any)
        .from("obra_funcionarios")
        .select("obras(id, nome)")
        .eq("employee_id", emp.id)
        .eq("status", true);
      const obras = (links ?? []).map((l: any) => l.obras).filter(Boolean);
      setObras(obras as Obra[]);
    } else {
      // Fallback (admin sem employee): todas as obras
      const { data } = await (supabase as any)
        .from("obras").select("id, nome").order("nome");
      setObras((data ?? []) as Obra[]);
    }
  }

  async function handleLogin(email: string, senha: string) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) toast.error("Usuário ou senha inválidos");
    else { await fetchObras(); setScreen("home"); }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setScreen("login"); setObraId(""); setObra(null);
  }

  function selecionarObra(o: Obra) {
    setObra(o); setObraId(o.id); setScreen("home");
    setPending(OfflineDB.getPending());
    setCacheTs(OfflineDB.getCacheTs(o.id));
    if (navigator.onLine) downloadCache(o.id);
  }

  // ─── Cache de funcionários da obra ────────────────────────────────────────
  async function downloadCache(id: string) {
    setDownloading(true);
    try {
      const { data } = await (supabase as any)
        .from("obra_funcionarios")
        .select("employees(id, nome, foto_url, cargos(nome))")
        .eq("obra_id", id)
        .eq("status", true);
      const emps: CachedEmp[] = (data ?? [])
        .map((r: any) => r.employees).filter(Boolean)
        .map((e: any) => ({ id: e.id, nome: e.nome,
          cargo: e.cargos?.nome ?? null, foto_url: e.foto_url ?? null }));
      OfflineDB.setEmps(id, emps);
      setCacheTs(Date.now());
    } catch { /* silencioso — cache anterior fica válido */ }
    finally { setDownloading(false); }
  }

  // ─── Sincronizar fila offline ─────────────────────────────────────────────
  async function syncPendingItems() {
    const items = OfflineDB.getPending();
    if (!items.length || !navigator.onLine) return;
    setSyncing(true);
    const synced: string[] = [];
    for (const item of items) {
      try {
        const { error } = await (supabase as any).from("efetivo_ponto").upsert({
          obra_id:           item.obra_id,
          employee_id:       item.employee_id,
          data:              item.data,
          frente:            item.frente,
          empresa:           null,
          hora_entrada:      null,
          hora_saida:        null,
          horas_trabalhadas: item.horas_trabalhadas,
          horas_extras:      item.horas_extras,
          ausencia:          false,
          motivo_ausencia:   item.motivo_ausencia,
          registrado_por:    item.registrado_por,
          fonte:             "campo",
        }, { onConflict: "obra_id,employee_id,data" });
        if (!error) synced.push(item.localId);
      } catch { /* tenta o próximo */ }
    }
    if (synced.length) {
      OfflineDB.removePending(synced);
      setPending(OfflineDB.getPending());
      toast.success(`✅ ${synced.length} apontamento${synced.length > 1 ? "s" : ""} sincronizado${synced.length > 1 ? "s" : ""}!`);
    }
    setSyncing(false);
  }

  // ─── Scanner / QR ──────────────────────────────────────────────────────────
  async function onQrLido(raw: string) {
    if (scanning) return;
    setScanning(true); setScanError("");
    try {
      const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (!uuidMatch) { setScanError("QR inválido — não é um crachá do sistema"); setScanning(false); return; }
      const empId = uuidMatch[0];

      // ── MODO OFFLINE ────────────────────────────────────────────────────────
      if (!navigator.onLine) {
        // Verificar duplicata na fila pendente
        if (OfflineDB.hasDuplicate(obraId, empId, data)) {
          setScanError("⚠️ Funcionário já registrado hoje (aguardando sync)");
          setScanning(false); return;
        }
        // Buscar no cache local
        const cached = OfflineDB.getEmps(obraId);
        const emp = cached.find(e => e.id === empId);
        if (!emp) {
          setScanError(cached.length === 0
            ? "Cache vazio. Conecte-se à internet uma vez para baixar os funcionários."
            : "Funcionário não encontrado no cache desta obra.");
          setScanning(false); return;
        }
        setFunc({ id: emp.id, nome: emp.nome, cargo: emp.cargo,
          foto_url: emp.foto_url, matricula: null, departamento: null });
        setFrente(""); setAtividade(""); setTurno("dia"); setHorasNorm("8"); setHorasExtra("0"); setObs("");
        setScreen("confirm");
        setScanning(false); return;
      }

      // ── MODO ONLINE ─────────────────────────────────────────────────────────
      const { data: exist } = await (supabase as any)
        .from("efetivo_ponto").select("id")
        .eq("obra_id", obraId).eq("employee_id", empId).eq("data", data).maybeSingle();
      // Também verifica duplicata na fila local (pode ter sido salvo offline)
      if (exist || OfflineDB.hasDuplicate(obraId, empId, data)) {
        setScanError("⚠️ Funcionário já registrado hoje nesta obra");
        setScanning(false); return;
      }

      const { data: emp } = await (supabase as any)
        .from("employees").select("id, nome, foto_url, cargos(nome)")
        .eq("id", empId).maybeSingle();
      if (!emp) { setScanError("Funcionário não encontrado no sistema"); setScanning(false); return; }

      setFunc({ id: emp.id, nome: emp.nome, matricula: null,
        cargo: emp.cargos?.nome ?? null, foto_url: emp.foto_url ?? null, departamento: null });
      setFrente(""); setAtividade(""); setTurno("dia"); setHorasNorm("8"); setHorasExtra("0"); setObs("");
      setScreen("confirm");
    } catch (e: any) { setScanError(e.message); }
    finally { setScanning(false); }
  }

  // ─── Confirmar apontamento ──────────────────────────────────────────────────
  async function handleConfirmar() {
    if (!func || !obraId) return;
    setSaving(true);
    try {
      // ── OFFLINE: salva na fila local ───────────────────────────────────────
      if (!navigator.onLine) {
        const item: PendingItem = {
          localId:           crypto.randomUUID(),
          obra_id:           obraId,
          obra_nome:         obra?.nome ?? "",
          employee_id:       func.id,
          employee_nome:     func.nome,
          employee_cargo:    func.cargo,
          data,
          frente:            frente || null,
          horas_trabalhadas: parseFloat(horasNorm) || 8,
          horas_extras:      parseFloat(horasExtra) || 0,
          motivo_ausencia:   obs || null,
          registrado_por:    user?.id ?? null,
          created_at:        new Date().toISOString(),
        };
        OfflineDB.addPending(item);
        setPending(OfflineDB.getPending());
        setSavedOffline(true);
        setScreen("sucesso");
        return;
      }

      // ── ONLINE: grava direto no Supabase ──────────────────────────────────
      setSavedOffline(false);
      const { data: { user: u } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("efetivo_ponto").upsert({
        obra_id:           obraId,
        employee_id:       func.id,
        data,
        frente:            frente || null,
        empresa:           null,
        hora_entrada:      null,
        hora_saida:        null,
        horas_trabalhadas: parseFloat(horasNorm) || 8,
        horas_extras:      parseFloat(horasExtra) || 0,
        ausencia:          false,
        motivo_ausencia:   obs || null,
        registrado_por:    u?.id,
        fonte:             "campo",
      }, { onConflict: "obra_id,employee_id,data" });
      if (error) throw new Error(error.message);
      setScreen("sucesso");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  // ─── Lista do dia ──────────────────────────────────────────────────────────
  const fetchLista = useCallback(async () => {
    if (!obraId) return;
    setLoadingLista(true);
    const { data: rows } = await (supabase as any)
      .from("efetivo_ponto")
      .select("id, employee_id, frente, horas_trabalhadas, horas_extras, ausencia, fonte, created_at, employees(nome, foto_url, cargos(nome))")
      .eq("obra_id", obraId)
      .eq("data", data)
      .order("created_at", { ascending: false });
    setApontamentos((rows ?? []) as Apontamento[]);
    setLoadingLista(false);
  }, [obraId, data]);

  useEffect(() => { if (screen === "lista") fetchLista(); }, [screen, fetchLista]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) return <Splash />;

  if (!user || screen === "login") return (
    <LoginScreen onLogin={handleLogin} loading={loading} />
  );

  if (!obraId || !obra) return (
    <ObraSelector obras={obras} onSelect={selecionarObra} onLogout={handleLogout} />
  );

  if (screen === "home") return (
    <HomeScreen obra={obra} data={data} setData={setData}
      onScanner={() => { setScanError(""); setScreen("scanner"); }}
      onLista={() => setScreen("lista")}
      onTrocarObra={() => { setObraId(""); setObra(null); }}
      onLogout={handleLogout}
      obraId={obraId}
      isOnline={isOnline}
      pending={pending}
      syncing={syncing}
      onSync={syncPendingItems}
      downloading={downloading}
      cacheTs={cacheTs}
      onRefreshCache={() => downloadCache(obraId)}
    />
  );

  if (screen === "scanner") return (
    <ScannerScreen onQrLido={onQrLido} onBack={() => setScreen("home")}
      scanning={scanning} error={scanError} onClearError={() => setScanError("")}
    />
  );

  if (screen === "confirm" && func) return (
    <ConfirmScreen func={func} frente={frente} setFrente={setFrente}
      atividade={atividade} setAtividade={setAtividade}
      turno={turno} setTurno={setTurno}
      horasNorm={horasNorm} setHorasNorm={setHorasNorm}
      horasExtra={horasExtra} setHorasExtra={setHorasExtra}
      obs={obs} setObs={setObs}
      onConfirmar={handleConfirmar} onCancelar={() => setScreen("scanner")}
      saving={saving}
    />
  );

  if (screen === "sucesso" && func) return (
    <SucessoScreen func={func}
      onProximo={() => { setScanError(""); setScreen("scanner"); }}
      onLista={() => setScreen("lista")}
      offline={savedOffline}
    />
  );

  if (screen === "lista") return (
    <ListaScreen apontamentos={apontamentos} obra={obra} data={data}
      loading={loadingLista} onBack={() => setScreen("home")} onRefresh={fetchLista}
    />
  );

  return null;
}

// ─── Primitivos de layout ─────────────────────────────────────────────────────
const S = {
  screen:  "min-h-screen bg-slate-900 flex flex-col",
  header:  "bg-slate-900 border-b border-slate-700/60 px-5 pb-4",
  card:    "bg-slate-800 border border-slate-700/60 rounded-2xl",
  input:   "w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500",
  label:   "block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5",
  btnPrim: "w-full bg-blue-600 active:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl py-4 text-sm flex items-center justify-center gap-2 transition-colors",
  btnSec:  "w-full bg-slate-800 active:bg-slate-700 border border-slate-700 text-white font-bold rounded-2xl py-4 text-sm flex items-center justify-center gap-2 transition-colors",
  back:    "h-10 w-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center flex-shrink-0",
};

// ═══════════════════════════════════════════════════════════════════════════════
// SPLASH
// ═══════════════════════════════════════════════════════════════════════════════
function Splash() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-5">
      <div className="h-20 w-20 rounded-3xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-900/50">
        <ClipboardList className="h-11 w-11 text-white" />
      </div>
      <div className="text-center">
        <p className="text-white font-extrabold text-xl">Apontador de Campo</p>
        <p className="text-slate-500 text-sm mt-1">Ápice Gestão</p>
      </div>
      <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLogin, loading }: { onLogin: (e: string, s: string) => void; loading: boolean }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  return (
    <div className={S.screen}>
      {/* Topo com logo */}
      <div className="flex-1 flex flex-col justify-center px-5 gap-10">
        <div className="text-center">
          <div className="h-20 w-20 rounded-3xl bg-blue-600 flex items-center justify-center mx-auto shadow-xl shadow-blue-900/50">
            <ClipboardList className="h-11 w-11 text-white" />
          </div>
          <h1 className="text-white text-2xl font-extrabold mt-5">Apontador de Campo</h1>
          <p className="text-slate-500 text-sm mt-1">Ápice Gestão</p>
        </div>

        {/* Formulário */}
        <div className="space-y-4">
          <div>
            <label className={S.label}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" autoComplete="email" className={S.input} />
          </div>
          <div>
            <label className={S.label}>Senha</label>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" className={S.input}
              onKeyDown={e => e.key === "Enter" && onLogin(email, senha)} />
          </div>
          <div className="pt-2">
            <button onClick={() => onLogin(email, senha)} disabled={loading || !email || !senha}
              className={S.btnPrim}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>

      <p className="text-slate-600 text-xs text-center py-6">v1.0 • Ápice Gestão</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELETOR DE OBRA
// ═══════════════════════════════════════════════════════════════════════════════
function ObraSelector({ obras, onSelect, onLogout }: { obras: Obra[]; onSelect: (o: Obra) => void; onLogout: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = obras.filter(o => o.nome.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className={S.screen}>
      {/* Header */}
      <div className={cn(S.header, "pt-14 flex items-center justify-between")}>
        <div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Ápice Gestão</p>
          <h1 className="text-white font-extrabold text-xl mt-0.5">Selecionar Obra</h1>
        </div>
        <button onClick={onLogout}
          className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center">
          <LogOut className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* Search */}
      <div className="px-5 pt-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar obra..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500" />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-8 space-y-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Building2 className="h-10 w-10 text-slate-600" />
            <p className="text-slate-500 text-sm">Nenhuma obra encontrada</p>
          </div>
        )}
        {filtered.map(o => (
          <button key={o.id} onClick={() => onSelect(o)}
            className="w-full bg-slate-800 active:bg-slate-700 border border-slate-700/60 rounded-2xl px-4 py-4 flex items-center gap-4 transition-colors text-left">
            <div className="h-10 w-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-white font-semibold text-sm flex-1 min-w-0 truncate">{o.nome}</span>
            <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════════
function HomeScreen({ obra, data, setData, onScanner, onLista, onTrocarObra, onLogout, obraId,
  isOnline, pending, syncing, onSync, downloading, cacheTs, onRefreshCache }: {
  obra: Obra; data: string; setData: (d: string) => void;
  onScanner: () => void; onLista: () => void; onTrocarObra: () => void; onLogout: () => void; obraId: string;
  isOnline: boolean; pending: PendingItem[]; syncing: boolean; onSync: () => void;
  downloading: boolean; cacheTs: number | null; onRefreshCache: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const pendingHoje = pending.filter(p => p.obra_id === obraId && p.data === data).length;
  const pendingTotal = pending.filter(p => p.obra_id === obraId).length;

  useEffect(() => {
    if (!isOnline) { setCount(null); return; }
    (async () => {
      const { count: c } = await (supabase as any)
        .from("efetivo_ponto").select("id", { count: "exact", head: true })
        .eq("obra_id", obraId).eq("data", data).eq("ausencia", false);
      setCount(c ?? 0);
    })();
  }, [obraId, data, isOnline]);

  const cacheAge = cacheTs
    ? Math.floor((Date.now() - cacheTs) / 60000) // minutos
    : null;

  return (
    <div className={S.screen}>
      {/* Banner offline */}
      {!isOnline && (
        <div className="bg-amber-900/80 border-b border-amber-700/60 px-5 py-2.5 flex items-center gap-2 pt-14">
          <WifiOff className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-xs font-semibold flex-1">Modo offline — apontamentos salvos localmente</p>
          {cacheAge !== null && (
            <span className="text-amber-500 text-[10px]">cache {cacheAge < 60 ? `${cacheAge}min` : `${Math.floor(cacheAge/60)}h`}</span>
          )}
        </div>
      )}

      {/* Header */}
      <div className={cn(S.header, !isOnline ? "pt-3" : "pt-14")}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Obra ativa</p>
            <h1 className="text-white font-extrabold text-xl leading-tight truncate mt-0.5">{obra.nome}</h1>
            <p className="text-blue-400 text-xs mt-1 capitalize">{fmtDataBR(data)}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {isOnline && (
              <button onClick={onRefreshCache} disabled={downloading}
                className={cn(S.back, "text-slate-400")} title="Atualizar cache offline">
                <RefreshCw className={cn("h-4 w-4", downloading && "animate-spin")} />
              </button>
            )}
            <button onClick={onTrocarObra} className={cn(S.back, "text-slate-400")} title="Trocar obra">
              <Building2 className="h-4 w-4" />
            </button>
            <button onClick={onLogout} className={cn(S.back, "text-slate-400")} title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Seletor de data */}
        <div>
          <label className={S.label}>Data de referência</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {/* KPI apontados */}
      <div className="px-5 pt-5">
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-5 flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="h-9 w-9 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-5xl font-black text-white tabular-nums">
              {isOnline ? (count ?? "—") : <span className="text-3xl text-slate-500">offline</span>}
            </p>
            <p className="text-blue-300 text-sm font-semibold mt-0.5">
              {isOnline ? (count === 1 ? "funcionário apontado" : "funcionários apontados") : "conecte para ver o total"}
            </p>
          </div>
          {/* Badge de pendentes */}
          {pendingHoje > 0 && (
            <div className="text-right flex-shrink-0">
              <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold px-2.5 py-1.5 rounded-xl tabular-nums block">
                +{pendingHoje} local
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Banner de pendentes para sync */}
      {pendingTotal > 0 && isOnline && (
        <div className="mx-5 mt-3">
          <button onClick={onSync} disabled={syncing}
            className="w-full bg-amber-600/15 border border-amber-500/40 rounded-2xl px-4 py-3 flex items-center gap-3">
            {syncing
              ? <Loader2 className="h-5 w-5 text-amber-400 animate-spin flex-shrink-0" />
              : <Upload className="h-5 w-5 text-amber-400 flex-shrink-0" />
            }
            <div className="text-left flex-1">
              <p className="text-amber-300 text-sm font-bold">
                {syncing ? "Sincronizando..." : `${pendingTotal} apontamento${pendingTotal > 1 ? "s" : ""} para sincronizar`}
              </p>
              <p className="text-amber-600 text-xs">Toque para enviar ao servidor</p>
            </div>
          </button>
        </div>
      )}

      {/* Ações */}
      <div className="flex-1 px-5 pt-4 space-y-3">
        <button onClick={onScanner}
          className="w-full bg-blue-600 active:bg-blue-700 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <QrCode className="h-7 w-7" />
          </div>
          <div className="text-left flex-1">
            <p className="font-extrabold text-base leading-tight">Escanear Crachá</p>
            <p className="text-blue-200 text-xs mt-0.5">
              {isOnline ? "Aponte a câmera para o QR code" : "Modo offline — usa cache local"}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-blue-300" />
        </button>

        <button onClick={onLista}
          className="w-full bg-slate-800 active:bg-slate-700 border border-slate-700/60 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-7 w-7 text-slate-300" />
          </div>
          <div className="text-left flex-1">
            <p className="font-extrabold text-base leading-tight">Lista do Dia</p>
            <p className="text-slate-500 text-xs mt-0.5">Ver todos os apontamentos</p>
          </div>
          <div className="flex items-center gap-2">
            {(count ?? 0) + pendingHoje > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full tabular-nums">
                {(count ?? 0) + pendingHoje}
              </span>
            )}
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </div>
        </button>
      </div>

      <p className="text-slate-700 text-xs text-center py-5">Ápice Gestão • Apontador de Campo</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER
// ═══════════════════════════════════════════════════════════════════════════════
function ScannerScreen({ onQrLido, onBack, scanning, error, onClearError }: {
  onQrLido: (raw: string) => void; onBack: () => void;
  scanning: boolean; error: string; onClearError: () => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [camError,  setCamError]  = useState("");
  const [active,    setActive]    = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setCamError("");
    // Verifica se a API existe (contexto seguro)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError("Câmera não suportada neste dispositivo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);
        startDecoding();
      }
    } catch (err: any) {
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      if (denied) {
        setCamError("denied");
      } else {
        setCamError("Não foi possível acessar a câmera. Tente novamente.");
      }
    }
  }

  function openAppSettings() {
    // Capacitor: abre as configurações do app no Android
    if ((window as any).Capacitor?.Plugins?.App) {
      (window as any).Capacitor.Plugins.App.openUrl({ url: "app-settings://" });
    }
  }

  function stopCamera() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setActive(false);
  }

  function startDecoding() {
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      try {
        // @ts-ignore
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const codes = await barcodeDetector.detect(canvas);
        if (codes.length > 0) {
          const raw = codes[0].rawValue as string;
          onQrLido(raw);
        }
      } catch {
        // BarcodeDetector não disponível → fallback sem leitura automática
      }
    }, 300);
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-12 pb-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onBack} className="h-10 w-10 rounded-full bg-black/50 flex items-center justify-center">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div className="text-center">
          <p className="text-white font-bold">Escanear Crachá</p>
          <p className="text-slate-300 text-xs">Aponte para o QR code</p>
        </div>
        <div className="h-10 w-10" />
      </div>

      {/* Câmera */}
      <div className="flex-1 relative overflow-hidden">
        {camError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-900 px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-slate-800 flex items-center justify-center">
              <Camera className="h-9 w-9 text-slate-500" />
            </div>
            {camError === "denied" ? (
              <>
                <div>
                  <p className="text-white font-bold text-base">Permissão negada</p>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                    Acesse{" "}
                    <span className="text-white font-semibold">Configurações → Apps → Apontador de Campo → Permissões</span>
                    {" "}e ative a Câmera.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <button onClick={openAppSettings}
                    className="bg-blue-600 active:bg-blue-700 text-white px-6 py-3.5 rounded-2xl font-bold text-sm">
                    Abrir Configurações
                  </button>
                  <button onClick={startCamera}
                    className="bg-slate-800 border border-slate-700 text-slate-300 px-6 py-3.5 rounded-2xl font-semibold text-sm">
                    Tentar novamente
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-white font-semibold">{camError}</p>
                <button onClick={startCamera}
                  className="bg-blue-600 active:bg-blue-700 text-white px-6 py-3.5 rounded-2xl font-bold text-sm w-full">
                  Tentar novamente
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay guia */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Canto superior esquerdo */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                {/* Canto superior direito */}
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                {/* Canto inferior esquerdo */}
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                {/* Canto inferior direito */}
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                {/* Área de scan */}
                <div className="h-56 w-56 rounded-lg">
                  {scanning && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Linha de scan animada */}
            {active && !scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-56 w-56 relative overflow-hidden rounded-lg">
                  <div className="absolute left-0 right-0 h-0.5 bg-blue-400/70 animate-scan-line" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer com erro ou instrução */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pt-8 pb-10">
        {error ? (
          <div className="bg-red-900/80 border border-red-500/50 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-200 text-sm font-semibold">{error}</p>
            </div>
            <button onClick={onClearError} className="text-red-400">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <p className="text-slate-400 text-sm text-center">
            Posicione o QR code do crachá dentro da área
          </p>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        .animate-scan-line { animation: scan-line 2s linear infinite; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRMAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function ConfirmScreen({ func, frente, setFrente, atividade, setAtividade, turno, setTurno,
  horasNorm, setHorasNorm, horasExtra, setHorasExtra, obs, setObs, onConfirmar, onCancelar, saving }: {
  func: Funcionario; frente: string; setFrente: (v: string) => void;
  atividade: string; setAtividade: (v: string) => void;
  turno: string; setTurno: (v: string) => void;
  horasNorm: string; setHorasNorm: (v: string) => void;
  horasExtra: string; setHorasExtra: (v: string) => void;
  obs: string; setObs: (v: string) => void;
  onConfirmar: () => void; onCancelar: () => void; saving: boolean;
}) {
  const inputNum = "w-full bg-slate-800 border border-slate-700 text-white text-center rounded-xl px-3 py-3.5 text-2xl font-black focus:outline-none focus:border-blue-500";
  const select   = "w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className={S.screen}>
      {/* Header */}
      <div className={cn(S.header, "pt-14 flex items-center gap-3")}>
        <button onClick={onCancelar} className={S.back}>
          <ArrowLeft className="h-4 w-4 text-slate-400" />
        </button>
        <div>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Confirmar</p>
          <h1 className="text-white font-extrabold text-lg leading-tight">Apontamento</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* ── Funcionário ── */}
        <div className={cn(S.card, "p-4 flex items-center gap-4 border-green-700/40 bg-green-950/30")}>
          {func.foto_url ? (
            <img src={func.foto_url} alt={func.nome}
              className="h-16 w-16 rounded-xl object-cover flex-shrink-0 border border-slate-600" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-green-600/20 border border-green-600/30 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-8 w-8 text-green-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white font-extrabold text-base leading-tight truncate">{func.nome}</p>
            {func.cargo && <p className="text-slate-400 text-sm mt-0.5">{func.cargo}</p>}
            <div className="flex items-center gap-1.5 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400 text-xs font-semibold">Crachá identificado</span>
            </div>
          </div>
        </div>

        {/* ── Turno ── */}
        <div>
          <label className={S.label}>Turno</label>
          <div className="grid grid-cols-3 gap-2">
            {([["dia","☀️ Dia",Sun],["noite","🌙 Noite",Moon],["misto","⚡ Misto",Zap]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTurno(v)}
                className={cn("rounded-xl border py-3.5 text-sm font-bold transition-colors",
                  turno === v
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 active:bg-slate-700"
                )}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Horas ── */}
        <div>
          <label className={S.label}>Horas trabalhadas</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-500 text-xs mb-1.5 text-center">Normais</p>
              <input type="number" min="0" max="24" step="0.5" value={horasNorm}
                onChange={e => setHorasNorm(e.target.value)} className={inputNum} />
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1.5 text-center">Extras</p>
              <input type="number" min="0" max="24" step="0.5" value={horasExtra}
                onChange={e => setHorasExtra(e.target.value)} className={inputNum} />
            </div>
          </div>
          <p className="text-slate-600 text-xs text-center mt-2">
            Total: <span className="text-slate-400 font-semibold">{(parseFloat(horasNorm)||0) + (parseFloat(horasExtra)||0)}h</span>
          </p>
        </div>

        {/* ── Frente + Atividade ── */}
        <div className="space-y-4">
          <div>
            <label className={S.label}>Frente de serviço</label>
            <select value={frente} onChange={e => setFrente(e.target.value)} className={select}>
              <option value="">Selecione a frente...</option>
              {FRENTES_PADRAO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={S.label}>Atividade / Função</label>
            <select value={atividade} onChange={e => setAtividade(e.target.value)} className={select}>
              <option value="">{func.cargo ?? "Selecione..."}</option>
              {ATIVIDADES_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* ── Observação ── */}
        <div>
          <label className={S.label}>Observação <span className="normal-case text-slate-600">(opcional)</span></label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            placeholder="Alguma observação sobre o funcionário..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none placeholder:text-slate-600" />
        </div>
      </div>

      {/* Botões fixos */}
      <div className="px-5 pb-8 pt-3 border-t border-slate-800 grid grid-cols-2 gap-3">
        <button onClick={onCancelar} disabled={saving}
          className="bg-slate-800 active:bg-slate-700 border border-slate-700 text-white rounded-2xl py-4 font-bold text-sm transition-colors">
          Cancelar
        </button>
        <button onClick={onConfirmar} disabled={saving}
          className="bg-green-600 active:bg-green-700 disabled:opacity-40 text-white rounded-2xl py-4 font-bold text-sm transition-colors flex items-center justify-center gap-2">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          {saving ? "Salvando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUCESSO
// ═══════════════════════════════════════════════════════════════════════════════
function SucessoScreen({ func, onProximo, onLista, offline = false }: {
  func: Funcionario; onProximo: () => void; onLista: () => void; offline?: boolean;
}) {
  const [secs, setSecs] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => setSecs(s => s - 1), 1000);
    const timeout  = setTimeout(onProximo, 3000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [onProximo]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-5 gap-8">
      {/* Ícone */}
      <div className="relative">
        <div className="h-28 w-28 rounded-full bg-green-500/10 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Texto */}
      <div className="text-center">
        {offline ? (
          <div className="flex items-center gap-1.5 mb-2">
            <CloudOff className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest">Salvo localmente — sincroniza ao conectar</p>
          </div>
        ) : (
          <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Apontado com sucesso</p>
        )}
        <h2 className="text-white text-2xl font-extrabold leading-tight">{func.nome}</h2>
        {func.cargo && <p className="text-slate-400 text-sm mt-1">{func.cargo}</p>}
      </div>

      {/* Ações */}
      <div className="w-full max-w-xs space-y-3">
        <button onClick={onProximo} className={S.btnPrim}>
          <QrCode className="h-5 w-5" /> Próximo crachá
        </button>
        <button onClick={onLista} className={S.btnSec}>
          <ClipboardList className="h-5 w-5" /> Ver lista do dia
        </button>
      </div>

      <p className="text-slate-700 text-xs">Próximo automaticamente em {secs}s...</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LISTA DO DIA
// ═══════════════════════════════════════════════════════════════════════════════
function ListaScreen({ apontamentos, obra, data, loading, onBack, onRefresh }: {
  apontamentos: Apontamento[]; obra: Obra; data: string;
  loading: boolean; onBack: () => void; onRefresh: () => void;
}) {
  const presentes  = apontamentos.filter(a => !a.ausencia).length;
  const totalHoras = apontamentos.reduce((s, a) => s + (a.horas_trabalhadas ?? 0), 0);
  const totalExtra = apontamentos.reduce((s, a) => s + (a.horas_extras ?? 0), 0);

  return (
    <div className={S.screen}>
      {/* Header */}
      <div className={cn(S.header, "pt-14")}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className={S.back}>
            <ArrowLeft className="h-4 w-4 text-slate-400" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Lista do dia</p>
            <h1 className="text-white font-extrabold text-lg leading-tight truncate">{obra.nome}</h1>
          </div>
          <button onClick={onRefresh} disabled={loading}
            className={cn(S.back, "text-slate-400")}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Presentes",   value: String(presentes),        color: "text-blue-400",  bg: "bg-blue-600/10"  },
            { label: "HH Normal",   value: `${totalHoras}h`,         color: "text-green-400", bg: "bg-green-600/10" },
            { label: "HH Extra",    value: `${totalExtra}h`,         color: "text-amber-400", bg: "bg-amber-600/10" },
          ].map(k => (
            <div key={k.label} className={cn("rounded-xl px-3 py-2.5 text-center border border-slate-700/40", k.bg)}>
              <p className={cn("text-2xl font-black tabular-nums", k.color)}>{k.value}</p>
              <p className="text-slate-500 text-[10px] font-semibold mt-0.5 uppercase tracking-wider">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-10">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          </div>
        )}
        {!loading && apontamentos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardList className="h-12 w-12 text-slate-700" />
            <p className="text-slate-500 text-sm font-medium">Nenhum apontamento hoje</p>
            <p className="text-slate-600 text-xs">Escaneie os crachás para registrar</p>
          </div>
        )}
        {!loading && apontamentos.map((a, i) => {
          const nome  = a.employees?.nome ?? "—";
          const foto  = a.employees?.foto_url;
          const cargo = a.employees?.cargos?.nome;
          const horas = a.horas_trabalhadas ?? 0;
          const extra = a.horas_extras ?? 0;
          const iniciais = nome.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
          return (
            <div key={a.id} className={cn(
              S.card, "p-4 flex items-center gap-3",
              a.ausencia && "border-red-800/40 bg-red-950/20"
            )}>
              {/* Avatar */}
              {foto ? (
                <img src={foto} alt={nome}
                  className="h-12 w-12 rounded-xl object-cover flex-shrink-0 border border-slate-600/50" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-slate-700 border border-slate-600/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-300 text-sm font-bold">{iniciais}</span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{nome}</p>
                <p className="text-slate-500 text-xs truncate">{cargo ?? "—"}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {a.frente && (
                    <span className="text-[10px] bg-blue-600/15 text-blue-300 border border-blue-600/20 px-2 py-0.5 rounded-full font-medium">
                      {a.frente}
                    </span>
                  )}
                  {a.ausencia && (
                    <span className="text-[10px] bg-red-600/20 text-red-300 border border-red-600/20 px-2 py-0.5 rounded-full font-medium">
                      Ausente
                    </span>
                  )}
                </div>
              </div>

              {/* Horas */}
              <div className="text-right flex-shrink-0 min-w-[52px]">
                {!a.ausencia && (
                  <>
                    <p className="text-white font-black text-base tabular-nums">{horas}h</p>
                    {extra > 0 && (
                      <p className="text-amber-400 text-[11px] font-semibold tabular-nums">+{extra}h</p>
                    )}
                  </>
                )}
                <p className="text-slate-600 text-[10px] tabular-nums mt-0.5">{fmtHora(a.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
