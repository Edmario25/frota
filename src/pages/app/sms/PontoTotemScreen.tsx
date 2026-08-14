import { useEffect, useRef, useState, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"

// ─── Types ────────────────────────────────────────────────────────────────────
type Estado = "scanning" | "loading" | "confirmado" | "erro"

interface Confirmacao {
  nome: string
  foto_url: string | null
  tipo: "entrada" | "saida"
  hora: string
  cargo: string
}

interface Props {
  obraId: string | null
  registradoPor: string   // id do técnico que está operando o totem
  onBack: () => void
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESET_MS = 4000   // tempo de exibição da confirmação

// ─── Componente ───────────────────────────────────────────────────────────────
export function PontoTotemScreen({ obraId, registradoPor, onBack }: Props) {
  const [estado,      setEstado]      = useState<Estado>("scanning")
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [erroMsg,     setErroMsg]     = useState("")
  const [hora,        setHora]        = useState(agora())

  const scannerRef = useRef<any>(null)
  const doneRef    = useRef(false)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Relógio no header
  useEffect(() => {
    const iv = setInterval(() => setHora(agora()), 10_000)
    return () => clearInterval(iv)
  }, [])

  // ── Scanner ──────────────────────────────────────────────────────────────────
  const iniciarScanner = useCallback(async () => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = new Html5Qrcode("ponto-totem-reader")
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 230, height: 230 } },
        async (decoded: string) => {
          if (doneRef.current) return
          const id = decoded.trim()
          if (!UUID_RE.test(id)) return       // QR não é UUID — ignora
          doneRef.current = true
          setEstado("loading")
          try { await scanner.stop() } catch { /* já parou */ }
          await processarPonto(id)
        },
        () => {}
      )
    } catch {
      setErroMsg("Câmera indisponível — verifique as permissões")
      setEstado("erro")
    }
  }, [])

  useEffect(() => {
    iniciarScanner()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      scannerRef.current?.stop().catch(() => {})
    }
  }, [iniciarScanner])

  // ── Processar ponto ──────────────────────────────────────────────────────────
  const processarPonto = async (employeeId: string) => {
    try {
      // 1. Dados do funcionário
      const { data: emp } = await (supabase as any)
        .from("employees")
        .select("nome, foto_url, cargos(nome)")
        .eq("id", employeeId)
        .maybeSingle()

      if (!emp) {
        mostrarErro("Funcionário não encontrado no sistema")
        return
      }

      // 2. Último registro hoje → determina entrada ou saída
      const hoje = new Date().toISOString().split("T")[0]
      const { data: ultimo } = await (supabase as any)
        .from("employee_ponto_qr")
        .select("tipo")
        .eq("employee_id", employeeId)
        .gte("registrado_em", `${hoje}T00:00:00`)
        .order("registrado_em", { ascending: false })
        .limit(1)
        .maybeSingle()

      const tipo: "entrada" | "saida" =
        ultimo?.tipo === "entrada" ? "saida" : "entrada"

      // 3. Grava o registro
      const { error } = await (supabase as any).from("employee_ponto_qr").insert({
        employee_id:    employeeId,
        obra_id:        obraId,
        tipo,
        registrado_por: registradoPor,
        metodo:         "qr",
      })
      if (error) throw error

      // 4. Confirmação na tela
      setConfirmacao({
        nome:     emp.nome,
        foto_url: emp.foto_url ?? null,
        tipo,
        hora:     new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        cargo:    emp.cargos?.nome ?? "",
      })
      setEstado("confirmado")
      reiniciarApos(RESET_MS)
    } catch (e: any) {
      mostrarErro(e.message || "Erro ao registrar ponto")
    }
  }

  const mostrarErro = (msg: string) => {
    setErroMsg(msg)
    setEstado("erro")
    reiniciarApos(3000)
  }

  const reiniciarApos = (ms: number) => {
    timerRef.current = setTimeout(async () => {
      doneRef.current = false
      setConfirmacao(null)
      setErroMsg("")
      setEstado("scanning")
      await iniciarScanner()
    }, ms)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-10 pb-3 bg-black/60 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-white/70 text-2xl leading-none px-1 hover:text-white"
          aria-label="Voltar"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-black text-base tracking-wide">🏗️ ÁPICE GESTÃO</p>
          <p className="text-gray-400 text-xs">Registro de Ponto — {hora}</p>
        </div>
        <div className="w-8" />
      </div>

      {/* ── Camera + Overlays ── */}
      <div className="relative flex-1">

        {/* html5-qrcode monta a câmera aqui */}
        <div id="ponto-totem-reader" className="absolute inset-0 w-full h-full" />

        {/* Hint de scanning */}
        {estado === "scanning" && (
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none">
            <div className="bg-black/60 rounded-2xl px-6 py-3 mx-4 text-center">
              <p className="text-white text-sm font-medium">Apresente o QR Code do crachá</p>
              <p className="text-gray-400 text-xs mt-0.5">O ponto será registrado automaticamente</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {estado === "loading" && (
          <div className="absolute inset-0 bg-gray-950/95 flex flex-col items-center justify-center z-20">
            <div className="w-14 h-14 rounded-full border-4 border-green-500 border-t-transparent animate-spin mb-5" />
            <p className="text-white text-sm font-medium">Registrando ponto...</p>
          </div>
        )}

        {/* Erro */}
        {estado === "erro" && (
          <div className="absolute inset-0 bg-red-950/95 flex flex-col items-center justify-center z-20 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-700 flex items-center justify-center mb-4 text-3xl">✕</div>
            <p className="text-white font-semibold text-base mb-1">{erroMsg}</p>
            <p className="text-red-300 text-xs">Reiniciando em instantes...</p>
          </div>
        )}

        {/* Confirmação */}
        {estado === "confirmado" && confirmacao && (
          <Confirmacao confirmacao={confirmacao} />
        )}
      </div>
    </div>
  )
}

// ─── Tela de Confirmação ──────────────────────────────────────────────────────
function Confirmacao({ confirmacao }: { confirmacao: NonNullable<ReturnType<() => {
  nome: string; foto_url: string | null; tipo: "entrada" | "saida"; hora: string; cargo: string
}>> }) {
  const isEntrada = confirmacao.tipo === "entrada"
  const corBg   = isEntrada ? "bg-green-950/97"   : "bg-blue-950/97"
  const corIcon = isEntrada ? "bg-green-500"       : "bg-blue-500"
  const corPill = isEntrada ? "bg-green-500"       : "bg-blue-500"
  const label   = isEntrada ? "ENTRADA"            : "SAÍDA"
  const iniciais = confirmacao.nome.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className={`absolute inset-0 ${corBg} flex flex-col items-center justify-center z-20 gap-3 transition-opacity duration-300`}>

      {/* Check icon */}
      <div className={`w-16 h-16 rounded-full ${corIcon} flex items-center justify-center shadow-lg`}>
        <span className="text-white text-4xl font-black leading-none">✓</span>
      </div>

      {/* Foto ou iniciais */}
      <div className="mt-1">
        {confirmacao.foto_url ? (
          <img
            src={confirmacao.foto_url}
            alt=""
            className="w-24 h-24 rounded-full object-cover border-4 border-white/30 shadow-xl"
          />
        ) : (
          <div className={`w-24 h-24 rounded-full ${corIcon} flex items-center justify-center text-white text-2xl font-black shadow-xl`}>
            {iniciais}
          </div>
        )}
      </div>

      {/* Nome e cargo */}
      <div className="text-center px-4">
        <p className="text-white text-2xl font-extrabold leading-tight">{confirmacao.nome.split(" ").slice(0, 2).join(" ")}</p>
        {confirmacao.cargo && (
          <p className="text-white/60 text-sm mt-0.5">{confirmacao.cargo}</p>
        )}
      </div>

      {/* Tipo e hora */}
      <div className={`${corPill} rounded-2xl px-10 py-3 shadow-lg`}>
        <p className="text-white text-3xl font-black tracking-widest text-center">{label}</p>
      </div>
      <p className="text-white/80 text-xl font-bold">{confirmacao.hora}</p>

      <p className="text-white/40 text-xs mt-4">Aguardando próximo crachá...</p>
    </div>
  )
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function agora() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
