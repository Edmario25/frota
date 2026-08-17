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
  ClipboardList, Zap, Menu, Loader2,
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

  async function fetchObras() {
    const { data } = await (supabase as any).from("obras").select("id, nome").order("nome");
    setObras((data ?? []) as Obra[]);
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

  function selecionarObra(o: Obra) { setObra(o); setObraId(o.id); setScreen("home"); }

  // ─── Scanner / QR ──────────────────────────────────────────────────────────
  async function onQrLido(raw: string) {
    if (scanning) return;
    setScanning(true); setScanError("");
    try {
      // Extrai UUID do QR — o crachá contém o employees.id diretamente
      const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (!uuidMatch) { setScanError("QR inválido — não é um crachá do sistema"); setScanning(false); return; }
      const empId = uuidMatch[0];

      // Verifica se já apontado hoje em efetivo_ponto
      const { data: exist } = await (supabase as any)
        .from("efetivo_ponto")
        .select("id")
        .eq("obra_id", obraId)
        .eq("employee_id", empId)
        .eq("data", data)
        .maybeSingle();

      if (exist) {
        setScanError("⚠️ Funcionário já registrado hoje nesta obra");
        setScanning(false); return;
      }

      // Busca dados do funcionário na tabela employees (igual ao crachá)
      const { data: emp } = await (supabase as any)
        .from("employees")
        .select("id, nome, foto_url, cargos(nome)")
        .eq("id", empId)
        .maybeSingle();

      if (!emp) { setScanError("Funcionário não encontrado no sistema"); setScanning(false); return; }

      // Adapta para o tipo Funcionario usado nas telas
      const f: Funcionario = {
        id:          emp.id,
        nome:        emp.nome,
        matricula:   null,
        cargo:       emp.cargos?.nome ?? null,
        foto_url:    emp.foto_url ?? null,
        departamento: null,
      };

      setFunc(f);
      setFrente(""); setAtividade(""); setTurno("dia"); setHorasNorm("8"); setHorasExtra("0"); setObs("");
      setScreen("confirm");
    } catch (e: any) { setScanError(e.message); }
    finally { setScanning(false); }
  }

  // ─── Confirmar apontamento ──────────────────────────────────────────────────
  // Grava diretamente em efetivo_ponto para integração com "Efetivo e Ponto"
  async function handleConfirmar() {
    if (!func || !obraId) return;
    setSaving(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("efetivo_ponto").upsert({
        obra_id:           obraId,
        employee_id:       func.id,
        data,
        frente:            frente || null,
        empresa:           null,
        hora_entrada:      null,         // campo não captura horário de entrada/saída
        hora_saida:        null,
        horas_trabalhadas: parseFloat(horasNorm) || 8,
        horas_extras:      parseFloat(horasExtra) || 0,
        ausencia:          false,
        motivo_ausencia:   obs || null,
        registrado_por:    u?.id,
        fonte:             "campo",      // identifica origem na tela Efetivo e Ponto
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
    const { data } = await (supabase as any)
      .from("efetivo_ponto")
      .select("id, employee_id, frente, horas_trabalhadas, horas_extras, ausencia, fonte, created_at, employees(nome, foto_url, cargos(nome))")
      .eq("obra_id", obraId)
      .eq("data", data)
      .order("created_at", { ascending: false });
    setApontamentos((data ?? []) as Apontamento[]);
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
    />
  );

  if (screen === "lista") return (
    <ListaScreen apontamentos={apontamentos} obra={obra} data={data}
      loading={loadingLista} onBack={() => setScreen("home")} onRefresh={fetchLista}
    />
  );

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPLASH
// ═══════════════════════════════════════════════════════════════════════════════
function Splash() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="h-16 w-16 rounded-2xl bg-blue-600 flex items-center justify-center">
        <ClipboardList className="h-9 w-9 text-white" />
      </div>
      <p className="text-white font-bold text-lg">Apontador de Campo</p>
      <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
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
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {/* Logo */}
        <div className="text-center">
          <div className="h-20 w-20 rounded-3xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-900/40">
            <ClipboardList className="h-11 w-11 text-white" />
          </div>
          <h1 className="text-white text-2xl font-extrabold">Apontador de Campo</h1>
          <p className="text-slate-400 text-sm mt-1">Registro de presença e apontamento</p>
        </div>

        {/* Form */}
        <div className="w-full max-w-sm space-y-3">
          <div className="space-y-1">
            <label className="text-slate-300 text-xs font-semibold uppercase tracking-wide">E-mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" autoComplete="email"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-300 text-xs font-semibold uppercase tracking-wide">Senha</label>
            <input
              type="password" value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
              onKeyDown={e => e.key === "Enter" && onLogin(email, senha)}
            />
          </div>
          <button
            onClick={() => onLogin(email, senha)} disabled={loading || !email || !senha}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 text-sm transition-colors flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
      <p className="text-slate-600 text-xs text-center pb-6">Ápice Gestão • Apontador de Campo</p>
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
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-base">Selecionar Obra</h1>
          <p className="text-slate-400 text-xs">Escolha a obra para apontar</p>
        </div>
        <button onClick={onLogout} className="text-slate-400 hover:text-white p-2">
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar obra..." className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 pl-10 text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-2">
        {filtered.map(o => (
          <button key={o.id} onClick={() => onSelect(o)}
            className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded-xl px-4 py-4 flex items-center justify-between gap-3 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <span className="text-white font-medium text-sm">{o.nome}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Nenhuma obra encontrada</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════════════════════════
function HomeScreen({ obra, data, setData, onScanner, onLista, onTrocarObra, onLogout, obraId }: {
  obra: Obra; data: string; setData: (d: string) => void;
  onScanner: () => void; onLista: () => void; onTrocarObra: () => void; onLogout: () => void; obraId: string;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { count: c } = await (supabase as any)
        .from("efetivo_ponto").select("id", { count: "exact", head: true })
        .eq("obra_id", obraId).eq("data", data).eq("ausencia", false);
      setCount(c ?? 0);
    })();
  }, [obraId, data]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 pt-12 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-xs uppercase tracking-wide font-semibold">Obra</p>
            <h1 className="text-white font-extrabold text-lg leading-tight truncate">{obra.nome}</h1>
            <p className="text-blue-400 text-xs mt-0.5 capitalize">{fmtDataBR(data)}</p>
          </div>
          <div className="flex gap-2 ml-3">
            <button onClick={onTrocarObra} title="Trocar obra"
              className="h-9 w-9 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-slate-300" />
            </button>
            <button onClick={onLogout} title="Sair"
              className="h-9 w-9 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center">
              <LogOut className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Data picker */}
        <div className="mt-3">
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {/* KPI */}
      <div className="px-4 pt-4">
        <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="h-8 w-8 text-white" />
          </div>
          <div>
            <p className="text-4xl font-extrabold text-white">{count ?? "—"}</p>
            <p className="text-blue-300 text-sm font-semibold">funcionário{count !== 1 ? "s" : ""} apontado{count !== 1 ? "s" : ""} hoje</p>
          </div>
        </div>
      </div>

      {/* Botões principais */}
      <div className="flex-1 px-4 pt-4 space-y-3">
        <button onClick={onScanner}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors shadow-lg shadow-blue-900/30">
          <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <QrCode className="h-7 w-7" />
          </div>
          <div className="text-left">
            <p className="font-extrabold text-lg leading-none">Escanear Crachá</p>
            <p className="text-blue-200 text-xs mt-1">Aponta câmera para o QR code</p>
          </div>
          <ChevronRight className="h-5 w-5 ml-auto opacity-70" />
        </button>

        <button onClick={onLista}
          className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-7 w-7 text-slate-300" />
          </div>
          <div className="text-left">
            <p className="font-extrabold text-lg leading-none">Lista do Dia</p>
            <p className="text-slate-400 text-xs mt-1">Ver todos os apontamentos</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {count != null && count > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
            )}
            <ChevronRight className="h-5 w-5 opacity-50" />
          </div>
        </button>
      </div>

      <p className="text-slate-600 text-xs text-center pb-6 pt-4">Ápice Gestão • Apontador de Campo</p>
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setActive(true);
        startDecoding();
      }
    } catch {
      setCamError("Não foi possível acessar a câmera. Verifique as permissões.");
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900 px-8 text-center">
            <Camera className="h-16 w-16 text-slate-600" />
            <p className="text-white font-semibold">{camError}</p>
            <button onClick={startCamera} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold">Tentar novamente</button>
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
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={onCancelar} className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <div>
          <h1 className="text-white font-bold">Confirmar Apontamento</h1>
          <p className="text-slate-400 text-xs">Verifique os dados e confirme</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Card do funcionário */}
        <div className="bg-green-900/30 border border-green-500/40 rounded-2xl p-4 flex items-center gap-4">
          {func.foto_url ? (
            <img src={func.foto_url} alt={func.nome} className="h-16 w-16 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-green-600/30 flex items-center justify-center flex-shrink-0">
              <UserCheck className="h-9 w-9 text-green-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-extrabold text-lg leading-tight truncate">{func.nome}</p>
            {func.cargo && <p className="text-slate-300 text-sm">{func.cargo}</p>}
            {func.matricula && <p className="text-slate-400 text-xs font-mono">Matrícula: {func.matricula}</p>}
          </div>
        </div>

        {/* Turno */}
        <div className="space-y-2">
          <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Turno</label>
          <div className="grid grid-cols-3 gap-2">
            {([["dia","Dia",Sun],["noite","Noite",Moon],["misto","Misto",Zap]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setTurno(v)}
                className={cn("rounded-xl border py-3 flex flex-col items-center gap-1 transition-colors",
                  turno === v ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                )}>
                <Icon className="h-5 w-5" />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Horas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Horas normais</label>
            <input type="number" min="0" max="24" step="0.5" value={horasNorm} onChange={e => setHorasNorm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-center rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-blue-500" />
          </div>
          <div className="space-y-1.5">
            <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Horas extras</label>
            <input type="number" min="0" max="24" step="0.5" value={horasExtra} onChange={e => setHorasExtra(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-center rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* Frente */}
        <div className="space-y-1.5">
          <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Frente de trabalho</label>
          <select value={frente} onChange={e => setFrente(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500">
            <option value="">Selecione...</option>
            {FRENTES_PADRAO.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {frente === "Outro" && (
            <input placeholder="Qual frente?" value={frente === "Outro" ? "" : frente} onChange={e => setFrente(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 mt-2" />
          )}
        </div>

        {/* Atividade */}
        <div className="space-y-1.5">
          <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Atividade / Função</label>
          <select value={atividade} onChange={e => setAtividade(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500">
            <option value="">{func.cargo ?? "Selecione..."}</option>
            {ATIVIDADES_PADRAO.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Obs */}
        <div className="space-y-1.5">
          <label className="text-slate-300 text-xs font-bold uppercase tracking-wide">Observação (opcional)</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Alguma observação..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none" />
        </div>
      </div>

      {/* Botões fixos */}
      <div className="px-4 pb-8 pt-3 border-t border-slate-800 bg-slate-900 grid grid-cols-2 gap-3">
        <button onClick={onCancelar} disabled={saving}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl py-4 font-bold text-sm transition-colors">
          Cancelar
        </button>
        <button onClick={onConfirmar} disabled={saving}
          className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white rounded-2xl py-4 font-bold text-sm transition-colors flex items-center justify-center gap-2">
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
function SucessoScreen({ func, onProximo, onLista }: {
  func: Funcionario; onProximo: () => void; onLista: () => void;
}) {
  useEffect(() => {
    // Auto avança para scanner após 3s
    const t = setTimeout(onProximo, 3000);
    return () => clearTimeout(t);
  }, [onProximo]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 gap-6">
      {/* Ícone animado */}
      <div className="h-24 w-24 rounded-full bg-green-500/20 flex items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
          <CheckCircle2 className="h-9 w-9 text-white" />
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-white text-2xl font-extrabold">Registrado!</h2>
        <p className="text-green-400 text-base font-semibold mt-1">{func.nome}</p>
        <p className="text-slate-400 text-sm mt-2">Apontamento salvo com sucesso</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <button onClick={onProximo}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2">
          <QrCode className="h-5 w-5" /> Próximo funcionário
        </button>
        <button onClick={onLista}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2">
          <ClipboardList className="h-5 w-5" /> Ver lista do dia
        </button>
      </div>

      <p className="text-slate-600 text-xs">Avançando automaticamente em 3s...</p>
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
  const totalHoras = apontamentos.reduce((s, a) => s + (a.horas_trabalhadas ?? 0) + (a.horas_extras ?? 0), 0);
  const totalExtra = apontamentos.reduce((s, a) => s + (a.horas_extras ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold truncate">{obra.nome}</h1>
            <p className="text-slate-400 text-xs capitalize">{fmtDataBR(data)}</p>
          </div>
          <button onClick={onRefresh} disabled={loading}
            className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center">
            <RefreshCw className={cn("h-4 w-4 text-white", loading && "animate-spin")} />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Presentes", value: presentes, color: "text-blue-400" },
            { label: "Total horas", value: `${totalHoras}h`, color: "text-green-400" },
            { label: "Extras", value: `${totalExtra}h`, color: "text-amber-400" },
          ].map(k => (
            <div key={k.label} className="bg-slate-700 rounded-xl px-3 py-2 text-center">
              <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
              <p className="text-slate-400 text-[10px]">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          </div>
        )}
        {!loading && apontamentos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Users className="h-12 w-12 text-slate-600" />
            <p className="text-slate-500 text-sm">Nenhum apontamento hoje</p>
          </div>
        )}
        {!loading && apontamentos.map(a => {
          const nome  = a.employees?.nome ?? "—";
          const foto  = a.employees?.foto_url;
          const cargo = a.employees?.cargos?.nome;
          const horas = a.horas_trabalhadas ?? 0;
          const extra = a.horas_extras ?? 0;
          return (
            <div key={a.id} className={cn(
              "border rounded-xl p-3 flex items-center gap-3",
              a.ausencia
                ? "bg-red-950/30 border-red-800/50"
                : "bg-slate-800 border-slate-700"
            )}>
              {foto ? (
                <img src={foto} alt={nome} className="h-11 w-11 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <UserCheck className="h-6 w-6 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{nome}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {a.ausencia && <span className="text-[10px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-medium">Ausente</span>}
                  {a.frente   && <span className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded font-medium">{a.frente}</span>}
                  {cargo      && <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-medium">{cargo}</span>}
                  {a.fonte === "campo" && <span className="text-[9px] bg-green-900/60 text-green-300 px-1.5 py-0.5 rounded font-bold">CAMPO</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {!a.ausencia && <p className="text-white font-bold text-sm tabular-nums">{horas}h</p>}
                {extra > 0   && <p className="text-amber-400 text-xs tabular-nums">+{extra}h extra</p>}
                <p className="text-slate-500 text-[10px] tabular-nums">{fmtHora(a.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
