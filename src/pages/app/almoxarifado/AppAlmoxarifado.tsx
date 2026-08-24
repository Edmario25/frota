import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import "./app-almoxarifado.css";
import "./devolucoes.css";

type Employee = { id: string; nome: string; cargo?: string | null };
type Stock = { material_id: string; quantidade: number; materiais_catalogo: { nome: string; unidade: string; tipo_item: "consumo" | "retornavel"; codigo_interno?: string | null; ativo: boolean } | null };
type CartItem = { material_id: string; nome: string; unidade: string; quantidade: number; saldo: number };
type Delivery = { id: string; numero: number; frente: string; created_at: string; employees: { nome: string } | null };
type Responsibility = { entrega_item_id: string; material_id: string; material_nome: string; unidade: string; quantidade_pendente: number; quantidade: number; condicao: "bom" | "avariado" | "inutilizado" };

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

function Signature({ onChange }: { onChange: (value: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

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
    if (!drawing.current) return; const p = point(event); const ctx = event.currentTarget.getContext("2d"); ctx?.lineTo(p.x, p.y); ctx?.stroke();
  };
  const end = () => { drawing.current = false; if (ref.current) onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const canvas = ref.current; if (!canvas) return; canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); onChange(""); };

  return <div><div className="signature-head"><strong>Assinatura de quem está retirando</strong><button type="button" onClick={clear}>Limpar</button></div><canvas ref={ref} className="signature" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /><small>Assine dentro do quadro para confirmar o recebimento dos itens.</small></div>;
}

export default function AppAlmoxarifado() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [obra, setObra] = useState<{ id: string; nome: string } | null>(null);
  const [operator, setOperator] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]); const [stock, setStock] = useState<Stock[]>([]);
  const [receiver, setReceiver] = useState(""); const [front, setFront] = useState(""); const [purpose, setPurpose] = useState(""); const [notes, setNotes] = useState("");
  const [search, setSearch] = useState(""); const [cart, setCart] = useState<CartItem[]>([]); const [signature, setSignature] = useState("");
  const [history, setHistory] = useState<Delivery[]>([]); const [tab, setTab] = useState<"delivery" | "return" | "history">("delivery");
  const [returnEmployee, setReturnEmployee] = useState(""); const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]); const [returnNotes, setReturnNotes] = useState("");
  const [scannerTarget, setScannerTarget] = useState<"delivery" | "return" | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");

  const load = useCallback(async (userId: string) => {
    setLoading(true); setMessage("");
    try {
      const { data: hasAccess, error: accessError } = await (supabase as any).rpc("has_employee_app_access", { p_app: "almoxarifado" });
      if (accessError || hasAccess !== true) throw new Error("Seu usuário não possui acesso ao App Almoxarifado.");
      const { data: emp, error: empError } = await (supabase as any).from("employees").select("id,nome,cargos(nome)").eq("user_id", userId).maybeSingle();
      if (empError || !emp) throw new Error("Seu usuário não possui cadastro de funcionário.");
      setOperator({ id: emp.id, nome: emp.nome, cargo: emp.cargos?.nome });
      const { data: links, error: linkError } = await (supabase as any).from("obra_funcionarios").select("obra_id,obras(id,nome)").eq("employee_id", emp.id).eq("status", true);
      if (linkError) throw linkError;
      if (!links?.length) throw new Error("Você não possui obra ativa vinculada.");
      if (links.length > 1) throw new Error("Você possui mais de uma obra ativa. Solicite a regularização do vínculo.");
      const selected = links[0].obras; setObra(selected);
      const [peopleResult, stockResult, historyResult] = await Promise.all([
        (supabase as any).rpc("listar_funcionarios_app_almoxarifado"),
        (supabase as any).from("almoxarifado_estoque").select("material_id,quantidade,materiais_catalogo!inner(nome,unidade,tipo_item,codigo_interno,ativo)").eq("obra_id", selected.id).eq("materiais_catalogo.ativo", true).gt("quantidade", 0),
        (supabase as any).from("almoxarifado_entregas").select("id,numero,frente,created_at,employees!almoxarifado_entregas_retirado_por_fkey(nome)").eq("entregue_por", emp.id).order("created_at", { ascending: false }).limit(30),
      ]);
      if (peopleResult.error) throw peopleResult.error; if (stockResult.error) throw stockResult.error;
      setEmployees(peopleResult.data ?? []);
      setStock(stockResult.data ?? []); setHistory(historyResult.data ?? []);
    } catch (error: any) { setMessage(error.message); setObra(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) load(data.session.user.id); else setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) load(next.user.id); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  async function login(event: React.FormEvent) { event.preventDefault(); setLoading(true); setMessage(""); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) { setMessage("E-mail ou senha inválidos."); setLoading(false); } }
  function add(item: Stock) { const mat = item.materiais_catalogo; if (!mat) return; setCart(current => current.some(row => row.material_id === item.material_id) ? current : [...current, { material_id: item.material_id, nome: mat.nome, unidade: mat.unidade, quantidade: 1, saldo: Number(item.quantidade) }]); }
  function qty(id: string, value: number) { setCart(current => current.map(item => item.material_id === id ? { ...item, quantidade: Math.max(0.001, Math.min(item.saldo, value || 0.001)) } : item)); }
  function reset() { setReceiver(""); setFront(""); setPurpose(""); setNotes(""); setCart([]); setSignature(""); setSearch(""); }

  async function loadResponsibilities(employeeId: string) {
    setReturnEmployee(employeeId); setMessage("");
    if (!employeeId) { setResponsibilities([]); return; }
    const { data, error } = await (supabase as any).rpc("listar_responsabilidades_almoxarifado", { p_funcionario_id: employeeId });
    if (error) setMessage(error.message); else setResponsibilities((data ?? []).map((item: any) => ({ ...item, quantidade_pendente: Number(item.quantidade_pendente), quantidade: Number(item.quantidade_pendente), condicao: "bom" })));
  }

  const handleEmployeeScan = useCallback((employeeId: string) => {
    const employee = employees.find(item => item.id.toLowerCase() === employeeId.toLowerCase());
    if (!employee) {
      setMessage("O QR Code pertence a um funcionário que não está ativo nesta obra.");
      setScannerTarget(null);
      return;
    }
    if (scannerTarget === "return") loadResponsibilities(employee.id);
    else setReceiver(employee.id);
    setMessage(`${employee.nome} identificado com sucesso.`);
    setScannerTarget(null);
  }, [employees, scannerTarget]);

  async function submitReturn() {
    const items = responsibilities.filter(item => item.quantidade > 0);
    if (!returnEmployee || !items.length) { setMessage("Selecione o funcionário e os itens devolvidos."); return; }
    setSaving(true); setMessage("");
    const deviceId = localStorage.getItem("almox_device_id") || crypto.randomUUID(); localStorage.setItem("almox_device_id", deviceId);
    const { error } = await (supabase as any).rpc("registrar_devolucao_almoxarifado", { p_funcionario_id: returnEmployee, p_observacoes: returnNotes, p_dispositivo_id: deviceId, p_itens: items.map(({ entrega_item_id, quantidade, condicao }) => ({ entrega_item_id, quantidade, condicao })) });
    if (error) setMessage(error.message); else { setMessage("Devolução registrada com sucesso e responsabilidade atualizada."); setReturnNotes(""); await loadResponsibilities(returnEmployee); if (session) await load(session.user.id); }
    setSaving(false);
  }

  async function submit() {
    if (!receiver || !front.trim() || !cart.length || !signature) { setMessage("Preencha o funcionário, a frente, os materiais e a assinatura."); return; }
    setSaving(true); setMessage("");
    const deviceId = localStorage.getItem("almox_device_id") || crypto.randomUUID(); localStorage.setItem("almox_device_id", deviceId);
    const { data, error } = await (supabase as any).rpc("registrar_entrega_almoxarifado", { p_retirado_por: receiver, p_frente: front, p_finalidade: purpose, p_observacoes: notes, p_assinatura_base64: signature, p_dispositivo_id: deviceId, p_itens: cart.map(({ material_id, quantidade }) => ({ material_id, quantidade })) });
    if (error) setMessage(error.message); else { setMessage(`Entrega registrada com sucesso. Comprovante ${String(data).slice(0, 8).toUpperCase()}.`); reset(); if (session) await load(session.user.id); }
    setSaving(false);
  }

  if (loading) return <main className="almox-shell center"><div className="spinner"/><p>Carregando almoxarifado...</p></main>;
  if (!session) return <main className="almox-shell center"><form className="login-card" onSubmit={login}><div className="brand-mark">A</div><h1>Ápice Almoxarifado</h1><p>Acesso operacional seguro</p>{message && <div className="alert">{message}</div>}<label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label><button className="primary" type="submit">Entrar</button></form></main>;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStock = stock.filter(item => {
    const material = item.materiais_catalogo;
    return !!material && (!normalizedSearch || material.nome.toLowerCase().includes(normalizedSearch) || (material.codigo_interno ?? "").toLowerCase().includes(normalizedSearch));
  });
  return <main className="almox-shell"><header><div><span className="eyebrow">OBRA VINCULADA</span><h1>{obra?.nome ?? "Acesso bloqueado"}</h1><p>{operator?.nome}</p></div><button className="logout" onClick={()=>supabase.auth.signOut()}>Sair</button></header>
    {!obra ? <section className="blocked"><b>Acesso indisponível</b><p>{message}</p></section> : <><nav><button className={tab==="delivery"?"active":""} onClick={()=>setTab("delivery")}>Nova saída</button><button className={tab==="return"?"active":""} onClick={()=>setTab("return")}>Devolução</button><button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>Histórico</button></nav>{message && <div className={message.includes("sucesso")?"success":"alert"}>{message}</div>}
    {tab === "delivery" && <div className="content"><section className="card"><h2>1. Quem está retirando?</h2><div className="employee-picker"><select value={receiver} onChange={e=>setReceiver(e.target.value)}><option value="">Selecione o funcionário...</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.nome}{emp.cargo?` — ${emp.cargo}`:""}</option>)}</select><button type="button" className="scan-employee" onClick={()=>setScannerTarget("delivery")}><span>▦</span> Escanear crachá</button></div><div className="two"><label>Frente de serviço<input value={front} onChange={e=>setFront(e.target.value)} placeholder="Ex.: Fundação" /></label><label>Finalidade<input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Atividade ou serviço" /></label></div></section>
    <section className="card"><div className="section-title"><h2>2. Materiais</h2>{stock.length>0&&<span>{stock.length} disponíveis</span>}</div><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por produto ou código..."/>{filteredStock.length===0?<div className="stock-empty"><b>{stock.length===0?"Nenhum produto com saldo disponível":"Produto não encontrado"}</b><p>{stock.length===0?"Registre uma entrada de estoque para esta obra no sistema gerencial.":"Confira o nome ou o código informado."}</p></div>:<div className="material-grid">{filteredStock.slice(0,20).map(item=><button key={item.material_id} className="material" onClick={()=>add(item)}><b>{item.materiais_catalogo?.nome}</b>{item.materiais_catalogo?.codigo_interno&&<small>{item.materiais_catalogo.codigo_interno}</small>}<span>Disponível: {item.quantidade} {item.materiais_catalogo?.unidade}</span><em>{item.materiais_catalogo?.tipo_item==="retornavel"?"Retornável":"Consumo"}</em><i>+ Adicionar</i></button>)}</div>}{filteredStock.length>20&&<p className="stock-limit">Mostrando os primeiros 20 resultados. Refine a busca para localizar outros produtos.</p>}{cart.length>0&&<div className="cart"><h3>Itens da entrega</h3>{cart.map(item=><div className="cart-row" key={item.material_id}><div><b>{item.nome}</b><span>Saldo {item.saldo} {item.unidade}</span></div><input type="number" min="0.001" max={item.saldo} step="any" value={item.quantidade} onChange={e=>qty(item.material_id,Number(e.target.value))}/><button onClick={()=>setCart(rows=>rows.filter(row=>row.material_id!==item.material_id))}>×</button></div>)}</div>}</section>
    <section className="card"><h2>3. Conferência e assinatura</h2><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Observações opcionais"/><Signature onChange={setSignature}/><button className="primary confirm" disabled={saving} onClick={submit}>{saving?"Registrando...":`Confirmar entrega (${cart.length} ${cart.length===1?"item":"itens"})`}</button></section></div>}
    {tab === "return" && <div className="content"><section className="card"><h2>1. Funcionário que está devolvendo</h2><div className="employee-picker"><select value={returnEmployee} onChange={e=>loadResponsibilities(e.target.value)}><option value="">Selecione o funcionário...</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.nome}{emp.cargo?` — ${emp.cargo}`:""}</option>)}</select><button type="button" className="scan-employee" onClick={()=>setScannerTarget("return")}><span>▦</span> Escanear crachá</button></div></section><section className="card"><h2>2. Itens sob responsabilidade</h2>{returnEmployee && responsibilities.length===0?<p className="empty-note">Este funcionário não possui itens retornáveis pendentes.</p>:responsibilities.map((item,index)=><div className="return-row" key={item.entrega_item_id}><div><b>{item.material_nome}</b><span>Pendente: {item.quantidade_pendente} {item.unidade}</span></div><input type="number" min="0" max={item.quantidade_pendente} step="any" value={item.quantidade} onChange={e=>setResponsibilities(rows=>rows.map((row,i)=>i===index?{...row,quantidade:Math.min(item.quantidade_pendente,Number(e.target.value))}:row))}/><select value={item.condicao} onChange={e=>setResponsibilities(rows=>rows.map((row,i)=>i===index?{...row,condicao:e.target.value as Responsibility["condicao"]}:row))}><option value="bom">Bom</option><option value="avariado">Avariado</option><option value="inutilizado">Inutilizado</option></select></div>)}</section>{responsibilities.length>0&&<section className="card"><h2>3. Confirmar recebimento</h2><textarea value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} placeholder="Observações sobre a devolução"/><button className="primary" disabled={saving} onClick={submitReturn}>{saving?"Registrando...":"Confirmar devolução"}</button></section>}</div>}
    {tab === "history" && <section className="card history"><h2>Últimas entregas</h2>{history.length===0?<p>Nenhuma entrega registrada.</p>:history.map(row=><article key={row.id}><div><b>Comprovante #{row.numero}</b><span>{row.employees?.nome} · {row.frente}</span></div><time>{new Date(row.created_at).toLocaleString("pt-BR")}</time></article>)}</section>}{scannerTarget && <EmployeeQrScanner onScan={handleEmployeeScan} onClose={()=>setScannerTarget(null)}/>}</>}</main>;
}
