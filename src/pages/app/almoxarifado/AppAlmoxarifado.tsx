import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import "./app-almoxarifado.css";
import "./devolucoes.css";

type Employee = { id: string; nome: string; cargo?: string | null };
type Stock = { material_id: string; quantidade: number; materiais_catalogo: { nome: string; unidade: string; tipo_item: "consumo" | "retornavel"; codigo_interno?: string | null; ativo: boolean } | null };
type CartItem = { material_id: string; nome: string; unidade: string; quantidade: number; saldo: number };
type Delivery = { kind?: "delivery" | "return"; id: string; numero: number; frente: string; created_at: string; employees: { nome: string } | null };
type Responsibility = { entrega_item_id: string; material_id: string; material_nome: string; unidade: string; quantidade_pendente: number; quantidade: number; condicao: "bom" | "avariado" | "inutilizado"; destino: "estoque" | "quarentena" | "manutencao" | "descarte" | "perda" };
type Work = { id: string; nome: string };
type Activity = { id: string; descricao: string; codigo?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function EmployeeQrScanner({ onScan, onClose }: { onScan: (employeeId: string) => void; onClose: () => void }) {
  const scannerRef = useRef<any>(null);
  const finishedRef = useRef(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Aponte a câmera para o QR Code do crachá");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("almox-employee-qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decoded: string) => {
            if (finishedRef.current || cancelled) return;
            const employeeId = decoded.trim();
            if (!UUID_RE.test(employeeId)) {
              setHint("QR Code inválido. Utilize o crachá gerado pelo sistema.");
              return;
            }
            finishedRef.current = true;
            try { await scanner.stop(); } catch { /* câmera já encerrada */ }
            scannerRef.current = null;
            if (!cancelled) onScan(employeeId);
          },
          () => { /* frames sem QR são esperados */ },
        );
      } catch (scanError: any) {
        if (cancelled) return;
        const denied = String(scanError?.message ?? scanError).toLowerCase().includes("permission");
        setError(denied ? "Permissão de câmera negada. Libere a câmera nas configurações do celular." : "Não foi possível abrir a câmera.");
      }
    }
    start();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) scanner.stop().catch(() => {});
    };
  }, [onScan]);

  return <div className="qr-scanner-modal">
    <div className="qr-scanner-head"><button type="button" onClick={onClose}>‹</button><strong>Identificar funcionário</strong></div>
    {error ? <div className="qr-scanner-error"><span>📷</span><p>{error}</p><button type="button" onClick={onClose}>Fechar</button></div> : <><div id="almox-employee-qr-reader" className="qr-reader"/><p className="qr-scanner-hint">{hint}</p></>}
  </div>;
}

function Signature({ onChange, resetToken, title = "Assinatura de quem está retirando" }: { onChange: (value: string) => void; title?: string; resetToken: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = 0; onChange("");
  }, [resetToken, onChange]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const resize = () => {
      const data = canvas.toDataURL();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio; canvas.height = 180 * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.scale(ratio, ratio); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; }
      if (data.length > 100) { const img = new Image(); img.onload = () => ctx?.drawImage(img, 0, 0, canvas.clientWidth, 180); img.src = data; }
    };
    resize(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event); const ctx = event.currentTarget.getContext("2d"); ctx?.beginPath(); ctx?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; strokes.current += 1; const p = point(event); const ctx = event.currentTarget.getContext("2d"); ctx?.lineTo(p.x, p.y); ctx?.stroke();
  };
  const end = () => { drawing.current = false; if (ref.current) onChange(strokes.current >= 10 ? ref.current.toDataURL("image/png") : ""); };
  const clear = () => { const canvas = ref.current; if (!canvas) return; strokes.current = 0; canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); onChange(""); };

  return <div><div className="signature-head"><strong>{title}</strong><button type="button" onClick={clear}>Limpar</button></div><canvas ref={ref} className="signature" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /><small>Faça uma assinatura completa dentro do quadro.</small></div>;
}

export default function AppAlmoxarifado() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [obra, setObra] = useState<{ id: string; nome: string } | null>(null);
  const [obras, setObras] = useState<Work[]>([]);
  const [operator, setOperator] = useState<Employee | null>(null);
  const [debtors, setDebtors] = useState<Employee[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]); const [stock, setStock] = useState<Stock[]>([]);
  const [receiver, setReceiver] = useState(""); const [front, setFront] = useState(""); const [purpose, setPurpose] = useState(""); const [notes, setNotes] = useState("");
  const [fronts, setFronts] = useState<string[]>([]); const [activities, setActivities] = useState<Activity[]>([]); const [activityId, setActivityId] = useState(""); const [costCenter, setCostCenter] = useState(""); const [employeeSearch, setEmployeeSearch] = useState("");
  const [search, setSearch] = useState(""); const [cart, setCart] = useState<CartItem[]>([]); const [signature, setSignature] = useState("");
  const [history, setHistory] = useState<Delivery[]>([]); const [tab, setTab] = useState<"delivery" | "return" | "history">("delivery");
  const [returnEmployee, setReturnEmployee] = useState(""); const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]); const [returnNotes, setReturnNotes] = useState("");
  const [returnSignature, setReturnSignature] = useState("");
  const [scannerTarget, setScannerTarget] = useState<"delivery" | "return" | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const deliveryOperation = useRef(""); const returnOperation = useRef("");
  const authUser = useRef<string | null>(null);
  const pendingRequest = useRef<{ name: string; args: Record<string, unknown> } | null>(null);

  async function sendOperation(name: string, args: Record<string, unknown>) {
    if (pendingRequest.current && JSON.stringify(pendingRequest.current) !== JSON.stringify({ name, args })) {
      throw new Error("Existe uma confirmação sem resposta. Repita a operação original antes de alterar os dados.");
    }
    pendingRequest.current = { name, args };
    const result = await (supabase as any).rpc(name, args);
    // SQL errors are transactional; transport errors may have committed remotely.
    if (!result.error || /^[0-9A-Z]{5}$/.test(result.error.code ?? "")) pendingRequest.current = null;
    return result;
  }

  const load = useCallback(async (userId: string, preferredObraId?: string) => {
    if (pendingRequest.current) { setMessage("Confirme a operação pendente antes de trocar de obra."); return; }
    setLoading(true); setMessage("");
    try {
      const { data: hasAccess, error: accessError } = await (supabase as any).rpc("has_employee_app_access", { p_app: "almoxarifado" });
      if (accessError || hasAccess !== true) throw new Error("Seu usuário não possui acesso ao App Almoxarifado.");
      const { data: emp, error: empError } = await (supabase as any).from("employees").select("id,nome,cargos(nome)").eq("user_id", userId).eq("status", "ativo").maybeSingle();
      if (empError || !emp) throw new Error("Seu usuário não possui cadastro de funcionário.");
      setOperator({ id: emp.id, nome: emp.nome, cargo: emp.cargos?.nome });
      const { data: links, error: linkError } = await (supabase as any).from("obra_funcionarios").select("obra_id,data_entrada,data_saida,obras(id,nome)").eq("employee_id", emp.id).eq("status", true).or(`data_saida.is.null,data_saida.gte.${new Date().toISOString().slice(0,10)}`);
      if (linkError) throw linkError;
      if (!links?.length) throw new Error("Você não possui obra ativa vinculada.");
      const availableWorks = links.filter((link: any) => !link.data_entrada || link.data_entrada <= new Date().toLocaleDateString("en-CA")).map((link: any) => link.obras).filter(Boolean) as Work[]; setObras(availableWorks);
      if (!availableWorks.length) throw new Error("Não há vínculo vigente com obra.");
      const selected = availableWorks.find(item => item.id === preferredObraId) ?? availableWorks[0]; setObra(selected);
      setReceiver(""); setReturnEmployee(""); setResponsibilities([]); setCart([]); setSignature(""); setReturnSignature("");
      setFront(""); setActivityId(""); setPurpose(""); setCostCenter(""); deliveryOperation.current = ""; returnOperation.current = "";
      const [peopleResult, stockResult, historyResult, frontsResult, activitiesResult, debtorsResult, returnsResult] = await Promise.all([
        (supabase as any).rpc("listar_funcionarios_app_almoxarifado_v2", { p_obra_id: selected.id }),
        (supabase as any).from("almoxarifado_estoque").select("material_id,quantidade,materiais_catalogo!inner(nome,unidade,tipo_item,codigo_interno,ativo)").eq("obra_id", selected.id).eq("materiais_catalogo.ativo", true).gt("quantidade", 0),
        (supabase as any).from("almoxarifado_entregas").select("id,numero,frente,created_at,employees!almoxarifado_entregas_retirado_por_fkey(nome)").eq("entregue_por", emp.id).eq("obra_id", selected.id).order("created_at", { ascending: false }).limit(30),
        (supabase as any).from("sms_frentes").select("nome").eq("obra_id", selected.id).eq("ativa", true).order("nome"),
        (supabase as any).from("cronograma_itens").select("id,descricao,codigo").eq("obra_id", selected.id).order("ordem"),
        (supabase as any).rpc("listar_devedores_almoxarifado_v2", { p_obra_id: selected.id }),
        (supabase as any).from("almoxarifado_devolucoes").select("id,numero,created_at,employees!almoxarifado_devolucoes_funcionario_id_fkey(nome)").eq("recebido_por", emp.id).eq("obra_id", selected.id).order("created_at", { ascending: false }).limit(30),
      ]);
      for (const result of [historyResult, frontsResult, activitiesResult, debtorsResult, returnsResult]) if (result.error) throw result.error;
      setDebtors(debtorsResult.data ?? []);
      if (peopleResult.error) throw peopleResult.error; if (stockResult.error) throw stockResult.error;
      setEmployees(peopleResult.data ?? []);
      setStock(stockResult.data ?? []); setHistory([...(historyResult.data ?? []).map((row: any) => ({ ...row, kind: "delivery" })), ...(returnsResult.data ?? []).map((row: any) => ({ ...row, kind: "return", frente: "Devolução" }))].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,30));
      setFronts((frontsResult.data ?? []).map((row: any) => row.nome)); setActivities(activitiesResult.data ?? []);
    } catch (error: any) { setMessage(error.message); setObra(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const acceptSession = (next: any) => {
      setSession(next);
      const id = next?.user.id ?? null;
      if (id === authUser.current) { if (!id) setLoading(false); return; }
      authUser.current = id;
      pendingRequest.current = null;
      if (id) void load(id);
      else { setObra(null); setOperator(null); setEmployees([]); setStock([]); setHistory([]); setResponsibilities([]); reset(); setReturnSignature(""); setPassword(""); setLoading(false); }
    };
    supabase.auth.getSession().then(({ data }) => acceptSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { queueMicrotask(() => acceptSession(next)); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function login(event: React.FormEvent) { event.preventDefault(); setLoading(true); setMessage(""); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) { setMessage("E-mail ou senha inválidos."); setLoading(false); } }
  function add(item: Stock) { const mat = item.materiais_catalogo; if (!mat) return; setCart(current => current.some(row => row.material_id === item.material_id) ? current : [...current, { material_id: item.material_id, nome: mat.nome, unidade: mat.unidade, quantidade: 1, saldo: Number(item.quantidade) }]); }
  function qty(id: string, value: number) { setCart(current => current.map(item => item.material_id === id ? { ...item, quantidade: value } : item)); }
  function reset() { setReceiver(""); setFront(""); setPurpose(""); setNotes(""); setCart([]); setSignature(""); setSearch(""); setActivityId(""); setCostCenter(""); setEmployeeSearch(""); deliveryOperation.current = ""; }

  async function loadResponsibilities(employeeId: string) {
    setReturnEmployee(employeeId); setResponsibilities([]); setReturnSignature(""); setMessage("");
    if (!employeeId) { setResponsibilities([]); return; }
    const { data, error } = await (supabase as any).rpc("listar_responsabilidades_almoxarifado_v2", { p_obra_id: obra?.id, p_funcionario_id: employeeId });
    if (error) setMessage(error.message); else setResponsibilities((data ?? []).map((item: any) => ({ ...item, quantidade_pendente: Number(item.quantidade_pendente), quantidade: 0, condicao: "bom", destino: "estoque" })));
  }

  const handleEmployeeScan = useCallback((employeeId: string) => {
    const employee = (scannerTarget === "return" ? debtors : employees).find(item => item.id.toLowerCase() === employeeId.toLowerCase());
    if (!employee) {
      setMessage("O QR Code pertence a um funcionário que não está ativo nesta obra.");
      setScannerTarget(null);
      return;
    }
    if (scannerTarget === "return") loadResponsibilities(employee.id);
    else setReceiver(employee.id);
    setMessage(`${employee.nome} identificado com sucesso.`);
    setScannerTarget(null);
  }, [employees, debtors, scannerTarget, obra?.id]);

  async function retryPending() {
    const pending = pendingRequest.current;
    if (!pending || saving) return;
    setSaving(true);
    try {
      const { error } = await sendOperation(pending.name, pending.args);
      if (error) throw error;
      if (session) await load(session.user.id, String(pending.args.p_obra_id));
      setMessage("Operação confirmada com sucesso, sem duplicar a movimentação.");
    } catch (error: any) { setMessage(error.message || "Sem resposta. Tente confirmar novamente."); }
    finally { setSaving(false); }
  }

  async function submitReturn() {
    const items = responsibilities.filter(item => item.quantidade > 0);
    if (!obra || !returnEmployee || !items.length || !returnSignature) { setMessage("Selecione o funcionário, os itens e obtenha a assinatura da devolução."); return; }
    if (items.some(item => item.condicao !== "bom") && returnNotes.trim().length < 5) { setMessage("Descreva nas observações o dano dos itens avariados ou inutilizados."); return; }
    if (items.some(item => !Number.isFinite(item.quantidade) || item.quantidade > item.quantidade_pendente)) { setMessage("Confira as quantidades da devolução."); return; }
    setSaving(true); setMessage("");
    const deviceId = localStorage.getItem("almox_device_id") || crypto.randomUUID(); localStorage.setItem("almox_device_id", deviceId);
    if (!returnOperation.current) returnOperation.current = crypto.randomUUID();
    const { error } = await sendOperation("registrar_devolucao_almoxarifado_v2", { p_operacao_id: returnOperation.current, p_obra_id: obra.id, p_funcionario_id: returnEmployee, p_observacoes: returnNotes, p_assinatura_base64: returnSignature, p_dispositivo_id: deviceId, p_itens: items.map(({ entrega_item_id, quantidade, condicao, destino }) => ({ entrega_item_id, quantidade, condicao, destino })) }).catch(error => ({ error }));
    if (error) setMessage(error.message); else { setReturnNotes(""); setReturnSignature(""); returnOperation.current = ""; if (session) await load(session.user.id, obra.id); setMessage("Devolução registrada com sucesso e responsabilidade atualizada."); }
    setSaving(false);
  }

  async function submit() {
    if (cart.some(item => !Number.isFinite(item.quantidade) || item.quantidade <= 0 || item.quantidade > item.saldo || (["un","und","unidade","pc","pç"].includes(item.unidade.toLowerCase()) && !Number.isInteger(item.quantidade)))) { setMessage("Confira as quantidades e o saldo. Itens por unidade não aceitam frações."); return; }
    if (!obra || !receiver || !front.trim() || (activities.length > 0 && !activityId) || (activities.length === 0 && !purpose.trim()) || !cart.length || !signature) { setMessage("Preencha o funcionário, a frente, a atividade/finalidade, os materiais e a assinatura."); return; }
    setSaving(true); setMessage("");
    const deviceId = localStorage.getItem("almox_device_id") || crypto.randomUUID(); localStorage.setItem("almox_device_id", deviceId);
    if (!deliveryOperation.current) deliveryOperation.current = crypto.randomUUID();
    const { data, error } = await sendOperation("registrar_entrega_almoxarifado_v2", { p_operacao_id: deliveryOperation.current, p_obra_id: obra.id, p_retirado_por: receiver, p_frente: front, p_cronograma_item_id: activityId || null, p_centro_custo: costCenter, p_finalidade: purpose, p_observacoes: notes, p_assinatura_base64: signature, p_dispositivo_id: deviceId, p_itens: cart.map(({ material_id, quantidade }) => ({ material_id, quantidade })) }).catch(error => ({ data: null, error }));
    if (error) setMessage(error.message); else { reset(); if (session) await load(session.user.id, obra.id); setMessage(`Entrega registrada com sucesso. Comprovante ${String(data).slice(0, 8).toUpperCase()}.`); }
    setSaving(false);
  }

  if (loading) return <main className="almox-shell center"><div className="spinner"/><p>Carregando almoxarifado...</p></main>;
  if (!session) return <main className="almox-shell center"><form className="login-card" onSubmit={login}><div className="brand-mark">A</div><h1>Ápice Almoxarifado</h1><p>Acesso operacional seguro</p>{message && <div className="alert">{message}</div>}<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="primary" type="submit">Entrar</button></form></main>;

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedEmployeeSearch = employeeSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredEmployees = employees.filter(employee => !normalizedEmployeeSearch || `${employee.nome} ${employee.cargo ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalizedEmployeeSearch));
  const filteredStock = stock.filter(item => {
    const material = item.materiais_catalogo;
    return !!material && (!normalizedSearch || material.nome.toLowerCase().includes(normalizedSearch) || (material.codigo_interno ?? "").toLowerCase().includes(normalizedSearch));
  });
  return <main className="almox-shell"><header><div><span className="eyebrow">OBRA VINCULADA</span>{obras.length > 1 ? <select value={obra?.id ?? ""} onChange={event => session && load(session.user.id, event.target.value)}>{obras.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select> : <h1>{obra?.nome ?? "Acesso bloqueado"}</h1>}<p>{operator?.nome}</p></div><button className="logout" onClick={()=>supabase.auth.signOut()}>Sair</button></header>
    {pendingRequest.current && <section className="card"><p>Existe uma operação aguardando confirmação. Não feche o app nem saia da conta antes de conferir.</p><button className="primary" disabled={saving} onClick={retryPending}>Consultar / confirmar operação pendente</button></section>}
    {!obra ? <section className="blocked"><b>Acesso indisponível</b><p>{message}</p></section> : <><nav><button className={tab==="delivery"?"active":""} onClick={()=>setTab("delivery")}>Nova saída</button><button className={tab==="return"?"active":""} onClick={()=>setTab("return")}>Devolução</button><button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>Histórico</button></nav>{message && <div className={message.includes("sucesso")?"success":"alert"}>{message}</div>}
    {tab === "delivery" && <div className="content"><section className="card"><h2>1. Quem está retirando?</h2><input className="search" value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} placeholder="Buscar funcionário por nome ou cargo..."/><div className="employee-picker"><select value={receiver} onChange={e=>setReceiver(e.target.value)}><option value="">Selecione o funcionário...</option>{filteredEmployees.map(emp=><option key={emp.id} value={emp.id}>{emp.nome}{emp.cargo?` — ${emp.cargo}`:""}</option>)}</select><button type="button" className="scan-employee" onClick={()=>setScannerTarget("delivery")}><span>▦</span> Escanear crachá</button></div><div className="two"><label>Frente de serviço{fronts.length?<select value={front} onChange={e=>setFront(e.target.value)}><option value="">Selecione...</option>{fronts.map(item=><option key={item} value={item}>{item}</option>)}</select>:<input value={front} onChange={e=>setFront(e.target.value)} placeholder="Cadastre as frentes no sistema"/>}</label><label>Atividade do cronograma{activities.length?<select value={activityId} onChange={e=>setActivityId(e.target.value)}><option value="">Selecione...</option>{activities.map(item=><option key={item.id} value={item.id}>{item.codigo?`${item.codigo} — `:""}{item.descricao}</option>)}</select>:<input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Informe a finalidade"/>}</label><label>Centro de custo<input value={costCenter} onChange={e=>setCostCenter(e.target.value)} placeholder="Opcional" /></label>{activities.length>0&&<label>Finalidade<input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Complemento opcional" /></label>}</div></section>
    <section className="card"><div className="section-title"><h2>2. Materiais</h2>{stock.length>0&&<span>{stock.length} disponíveis</span>}</div><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por produto ou código..."/>{filteredStock.length===0?<div className="stock-empty"><b>{stock.length===0?"Nenhum produto com saldo disponível":"Produto não encontrado"}</b><p>{stock.length===0?"Registre uma entrada de estoque para esta obra no sistema gerencial.":"Confira o nome ou o código informado."}</p></div>:<div className="material-grid">{filteredStock.slice(0,20).map(item=><button key={item.material_id} className="material" onClick={()=>add(item)}><b>{item.materiais_catalogo?.nome}</b>{item.materiais_catalogo?.codigo_interno&&<small>{item.materiais_catalogo.codigo_interno}</small>}<span>Disponível: {item.quantidade} {item.materiais_catalogo?.unidade}</span><em>{item.materiais_catalogo?.tipo_item==="retornavel"?"Retornável":"Consumo"}</em><i>+ Adicionar</i></button>)}</div>}{filteredStock.length>20&&<p className="stock-limit">Mostrando os primeiros 20 resultados. Refine a busca para localizar outros produtos.</p>}{cart.length>0&&<div className="cart"><h3>Itens da entrega</h3>{cart.map(item=><div className="cart-row" key={item.material_id}><div><b>{item.nome}</b><span>Saldo {item.saldo} {item.unidade}</span></div><input type="number" min="0.001" max={item.saldo} step="any" value={item.quantidade} onChange={e=>qty(item.material_id,Number(e.target.value))}/><button onClick={()=>setCart(rows=>rows.filter(row=>row.material_id!==item.material_id))}>×</button></div>)}</div>}</section>
    <section className="card"><h2>3. Conferência e assinatura</h2><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observações opcionais"/><Signature resetToken={JSON.stringify([receiver, front, activityId, purpose, costCenter, notes, cart])} onChange={setSignature}/><button className="primary confirm" disabled={saving} onClick={submit}>{saving?"Registrando...":`Confirmar entrega (${cart.length} ${cart.length===1?"item":"itens"})`}</button></section></div>}
    {tab === "return" && <div className="content"><section className="card"><h2>1. Funcionário que está devolvendo</h2><div className="employee-picker"><select value={returnEmployee} onChange={e=>loadResponsibilities(e.target.value)}><option value="">Selecione o funcionário...</option>{debtors.map(emp=><option key={emp.id} value={emp.id}>{emp.nome}{emp.cargo?` — ${emp.cargo}`:""}</option>)}</select><button type="button" className="scan-employee" onClick={()=>setScannerTarget("return")}><span>▦</span> Escanear crachá</button></div></section><section className="card"><h2>2. Itens sob responsabilidade</h2>{returnEmployee && responsibilities.length===0?<p className="empty-note">Este funcionário não possui itens retornáveis pendentes.</p>:responsibilities.map((item,index)=><div className="return-row" key={item.entrega_item_id}><div><b>{item.material_nome}</b><span>Pendente: {item.quantidade_pendente} {item.unidade}</span></div><input type="number" min="0" max={item.quantidade_pendente} step="any" value={item.quantidade} onChange={e=>setResponsibilities(rows=>rows.map((row,i)=>i===index?{...row,quantidade:Math.min(item.quantidade_pendente,Number(e.target.value))}:row))}/><select value={item.condicao} onChange={e=>setResponsibilities(rows=>rows.map((row,i)=>i===index?{...row,condicao:e.target.value as Responsibility["condicao"],destino:e.target.value==="bom"?"estoque":"quarentena"}:row))}><option value="bom">Bom</option><option value="avariado">Avariado</option><option value="inutilizado">Inutilizado</option></select>{item.condicao!=="bom"&&<select value={item.destino} onChange={e=>setResponsibilities(rows=>rows.map((row,i)=>i===index?{...row,destino:e.target.value as Responsibility["destino"]}:row))}><option value="quarentena">Quarentena</option><option value="manutencao">Manutenção</option><option value="descarte">Descarte</option><option value="perda">Perda</option></select>}</div>)}</section>{responsibilities.length>0&&<section className="card"><h2>3. Confirmar recebimento</h2><textarea value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} placeholder="Observações sobre a devolução"/><Signature resetToken={JSON.stringify([returnEmployee, responsibilities, returnNotes])} title="Assinatura de quem está devolvendo" onChange={setReturnSignature}/><button className="primary" disabled={saving} onClick={submitReturn}>{saving?"Registrando...":"Confirmar devolução"}</button></section>}</div>}
    {tab === "history" && <section className="card history"><h2>Últimas movimentações do operador</h2>{history.length===0?<p>Nenhuma movimentação registrada.</p>:history.map(row=><article key={`${row.kind}-${row.id}`}><div><b>{row.kind === "return" ? "Devolução" : "Entrega"} #{row.numero}</b><span>{row.employees?.nome} · {row.frente}</span></div><time>{new Date(row.created_at).toLocaleString("pt-BR")}</time></article>)}</section>}{scannerTarget && <EmployeeQrScanner onScan={handleEmployeeScan} onClose={()=>setScannerTarget(null)}/>}</>}</main>;
}
