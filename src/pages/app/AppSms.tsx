import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "@/integrations/supabase/client"
import { smsDb, RecordType } from "@/lib/sms-offline-db"
import { syncAll } from "@/lib/sms-sync"

import { DdsForm }       from "./sms/DdsForm"
import { DesvioForm }    from "./sms/DesvioForm"
import { InspecaoForm }  from "./sms/InspecaoForm"
import { AprForm }       from "./sms/AprForm"
import { RdoForm }       from "./sms/RdoForm"
import { NearMissForm }  from "./sms/NearMissForm"
import { AcidenteForm }  from "./sms/AcidenteForm"
import { PtForm }        from "./sms/PtForm"

// ─── types ────────────────────────────────────────────────────────────────────
type Employee = { id: string; nome: string; obra_id: string | null }
type Obra = { id: string; nome: string }
type Screen =
  | 'home'
  | 'hist'
  | 'form-dds' | 'form-desvio' | 'form-inspecao' | 'form-apr'
  | 'form-rdo' | 'form-near_miss' | 'form-acidente' | 'form-pt'

const MENU_ITEMS: { type: RecordType; label: string; emoji: string; desc: string; color: string }[] = [
  { type: 'dds',       label: 'DDS',          emoji: '🎓', desc: 'Diálogo Diário de Segurança',        color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { type: 'desvio',    label: 'Desvio',        emoji: '⚠️',  desc: 'Condição/ato inseguro',              color: 'bg-orange-50 border-orange-200 text-orange-800' },
  { type: 'inspecao',  label: 'Inspeção',      emoji: '🔍', desc: 'Inspeção de segurança',              color: 'bg-teal-50 border-teal-200 text-teal-800' },
  { type: 'apr',       label: 'APR',           emoji: '📋', desc: 'Análise Preliminar de Risco',        color: 'bg-purple-50 border-purple-200 text-purple-800' },
  { type: 'rdo',       label: 'RDO',           emoji: '📝', desc: 'Relatório Diário de Obra',           color: 'bg-slate-50 border-slate-200 text-slate-800' },
  { type: 'near_miss', label: 'Near Miss',     emoji: '🚨', desc: 'Quase acidente',                    color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  { type: 'acidente',  label: 'Acidente',      emoji: '🏥', desc: 'Acidente / incidente',               color: 'bg-red-50 border-red-200 text-red-800' },
  { type: 'pt',        label: 'PT',            emoji: '🔑', desc: 'Permissão de Trabalho',              color: 'bg-green-50 border-green-200 text-green-800' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// ─── main component ───────────────────────────────────────────────────────────
export default function AppSms() {
  const [authState, setAuthState] = useState<'loading' | 'unauth' | 'ok'>('loading')
  const [employee, setEmployee]   = useState<Employee | null>(null)
  const [obras, setObras]         = useState<Obra[]>([])
  const [screen, setScreen]       = useState<Screen>('home')
  const [pendingCount, setPending]= useState(0)
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState('')
  const [histRecords, setHist]    = useState<Awaited<ReturnType<typeof smsDb.getAll>>>([])
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loginErr, setLoginErr]   = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // reference data
  const [ddsTemas, setDdsTemas]                 = useState<{ id: string; tema: string }[]>([])
  const [tiposAtividade, setTiposAtiv]          = useState<{ id: string; nome: string }[]>([])
  const [riscosCatalogo, setRiscosCatalog]      = useState<{ id: string; risco: string; categoria: string; recomendacao: string | null }[]>([])
  const [catalogoInspecoes, setCatalogoInsp]    = useState<{ id: string; nome: string }[]>([])
  const [itensCatalogo, setItensCatalog]        = useState<{ id: string; catalogo_id: string; item: string; criterio?: string | null }[]>([])

  const online = useOnlineStatus()
  const syncLock = useRef(false)

  // ── auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) loadEmployee(session.user.id)
      else setAuthState('unauth')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) loadEmployee(session.user.id)
      else { setAuthState('unauth'); setEmployee(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadEmployee = async (userId: string) => {
    const { data } = await (supabase as any).from('employees').select('id, nome, obra_id').eq('user_id', userId).maybeSingle()
    if (!data) { setAuthState('unauth'); return }
    setEmployee(data)
    setAuthState('ok')
    // load obras for this employee
    const { data: obrasData } = await (supabase as any).from('obras').select('id, nome').eq('ativa', true).order('nome')
    if (obrasData) setObras(obrasData)
    // load ref data when online
    if (navigator.onLine) loadRefData()
    // restore from IndexedDB cache
    else {
      const cached = await smsDb.getRef<typeof ddsTemas>('sms_dds_temas')
      if (cached) setDdsTemas(cached)
      const cTipos = await smsDb.getRef<typeof tiposAtividade>('sms_apr_tipos_atividade')
      if (cTipos) setTiposAtiv(cTipos)
      const cRiscos = await smsDb.getRef<typeof riscosCatalogo>('sms_apr_riscos_catalogo')
      if (cRiscos) setRiscosCatalog(cRiscos)
      const cCatInsp = await smsDb.getRef<typeof catalogoInspecoes>('sms_inspecoes_catalogo')
      if (cCatInsp) setCatalogoInsp(cCatInsp)
      const cItens = await smsDb.getRef<typeof itensCatalogo>('sms_inspecoes_itens_catalogo')
      if (cItens) setItensCatalog(cItens)
    }
    refreshCounts()
  }

  const loadRefData = async () => {
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        (supabase as any).from('sms_dds_temas').select('id, tema').order('tema'),
        (supabase as any).from('sms_apr_tipos_atividade').select('id, nome').order('nome'),
        (supabase as any).from('sms_apr_riscos_catalogo').select('id, risco, categoria, recomendacao').order('categoria, risco'),
        (supabase as any).from('sms_inspecoes_catalogo').select('id, nome').order('nome'),
        (supabase as any).from('sms_inspecoes_itens_catalogo').select('id, catalogo_id, item, criterio').order('item'),
      ])
      if (r1.data) { setDdsTemas(r1.data); await smsDb.setRef('sms_dds_temas', r1.data) }
      if (r2.data) { setTiposAtiv(r2.data); await smsDb.setRef('sms_apr_tipos_atividade', r2.data) }
      if (r3.data) { setRiscosCatalog(r3.data); await smsDb.setRef('sms_apr_riscos_catalogo', r3.data) }
      if (r4.data) { setCatalogoInsp(r4.data); await smsDb.setRef('sms_inspecoes_catalogo', r4.data) }
      if (r5.data) { setItensCatalog(r5.data); await smsDb.setRef('sms_inspecoes_itens_catalogo', r5.data) }
    } catch { /* offline */ }
  }

  const refreshCounts = async () => {
    const p = await smsDb.countPending()
    setPending(p)
  }

  // ── sync when coming online ──────────────────────────────────────────────────
  const doSync = useCallback(async () => {
    if (syncLock.current || !online || !employee) return
    syncLock.current = true
    setSyncing(true)
    setSyncMsg('Sincronizando...')
    try {
      const result = await syncAll()
      await refreshCounts()
      setSyncMsg(result.synced > 0 ? `✅ ${result.synced} registro(s) enviado(s)` : '✅ Tudo sincronizado')
    } catch {
      setSyncMsg('⚠️ Erro ao sincronizar')
    } finally {
      setSyncing(false)
      syncLock.current = false
      setTimeout(() => setSyncMsg(''), 3000)
    }
  }, [online, employee])

  useEffect(() => {
    if (online && employee) { loadRefData(); doSync() }
  }, [online])

  // ── save handler ─────────────────────────────────────────────────────────────
  const handleSave = async (type: RecordType, data: Record<string, unknown>) => {
    if (!employee) return
    const obraId = (data.obra_id as string) ?? employee.obra_id ?? ''
    const obraNome = obras.find(o => o.id === obraId)?.nome ?? obraId
    await smsDb.put({
      id: crypto.randomUUID(),
      type,
      data: { ...data, registrado_por: employee.id },
      obra_id: obraId,
      obra_nome: obraNome,
      employee_id: employee.id,
      created_at: new Date().toISOString(),
      synced: false,
    })
    await refreshCounts()
    if (online) doSync()
    setScreen('home')
  }

  // ── login ─────────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginErr('')
    setLoggingIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginErr('E-mail ou senha inválidos')
    setLoggingIn(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setScreen('home')
  }

  // ── render: loading ───────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  // ── render: login ─────────────────────────────────────────────────────────────
  if (authState === 'unauth') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-700 to-green-900 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <div className="text-6xl mb-3">🦺</div>
          <h1 className="text-2xl font-bold text-white">SMS Campo</h1>
          <p className="text-green-200 text-sm mt-1">Segurança, Meio Ambiente e Saúde</p>
        </div>
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <input
            type="email" required autoComplete="username"
            placeholder="E-mail"
            className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none bg-white/20 text-white placeholder-green-200 border border-white/30"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <input
            type="password" required autoComplete="current-password"
            placeholder="Senha"
            className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none bg-white/20 text-white placeholder-green-200 border border-white/30"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          {loginErr && <p className="text-red-300 text-xs text-center">{loginErr}</p>}
          <button type="submit" disabled={loggingIn}
            className="w-full rounded-2xl py-3.5 bg-white text-green-800 font-semibold text-sm disabled:opacity-60">
            {loggingIn ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    )
  }

  // ── render: forms ─────────────────────────────────────────────────────────────
  const formProps = { employee: employee!, obras, obraId: employee!.obra_id ?? '' }

  if (screen === 'form-dds')
    return <DdsForm {...formProps} ddsTemas={ddsTemas} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-desvio')
    return <DesvioForm {...formProps} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-inspecao')
    return <InspecaoForm {...formProps} catalogoInspecoes={catalogoInspecoes} itensCatalogo={itensCatalogo} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-apr')
    return <AprForm {...formProps} tiposAtividade={tiposAtividade} riscosCatalogo={riscosCatalogo} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-rdo')
    return <RdoForm {...formProps} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-near_miss')
    return <NearMissForm {...formProps} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-acidente')
    return <AcidenteForm {...formProps} onSave={handleSave} onBack={() => setScreen('home')} />
  if (screen === 'form-pt')
    return <PtForm {...formProps} onSave={handleSave} onBack={() => setScreen('home')} />

  // ── render: histórico ─────────────────────────────────────────────────────────
  const loadHist = async () => {
    const all = await smsDb.getAll()
    setHist(all.slice().reverse())
    setScreen('hist')
  }

  if (screen === 'hist') {
    const typeLabel: Record<RecordType, string> = {
      dds: 'DDS', desvio: 'Desvio', inspecao: 'Inspeção', apr: 'APR',
      rdo: 'RDO', near_miss: 'Near Miss', acidente: 'Acidente', pt: 'PT',
    }
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b px-4 pt-12 pb-3 flex items-center gap-3">
          <button onClick={() => setScreen('home')} className="text-gray-500 text-lg">←</button>
          <h1 className="font-semibold text-gray-900">Histórico local</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-24">
          {histRecords.length === 0 && (
            <p className="text-center text-gray-400 text-sm mt-12">Nenhum registro salvo neste dispositivo</p>
          )}
          {histRecords.map(r => (
            <div key={r.id} className={`bg-white rounded-xl border px-4 py-3 ${r.synced ? 'border-green-200' : r.sync_error ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{typeLabel[r.type]} · {r.obra_nome}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.synced ? 'bg-green-100 text-green-700' : r.sync_error ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {r.synced ? '✓ Enviado' : r.sync_error ? 'Erro' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleString('pt-BR')}</p>
              {r.sync_error && <p className="text-xs text-red-500 mt-1">{r.sync_error}</p>}
            </div>
          ))}
        </div>
        {pendingCount > 0 && online && (
          <div className="fixed bottom-20 left-4 right-4">
            <button onClick={doSync} disabled={syncing} className="w-full py-3 bg-green-700 text-white rounded-2xl font-semibold text-sm disabled:opacity-60">
              {syncing ? 'Sincronizando...' : `🔄 Sincronizar ${pendingCount} pendente(s)`}
            </button>
          </div>
        )}
        {/* bottom nav */}
        <BottomNav screen={screen} onHome={() => setScreen('home')} onHist={loadHist} />
      </div>
    )
  }

  // ── render: home ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* header */}
      <div className="bg-green-700 text-white px-4 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200 text-xs">SMS Campo</p>
            <h1 className="font-bold text-lg leading-tight">{employee!.nome.split(' ')[0]}</h1>
          </div>
          <div className="text-right">
            <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${online ? 'bg-green-600 text-green-100' : 'bg-gray-700 text-gray-300'}`}>
              {online ? '● Online' : '○ Offline'}
            </div>
            {pendingCount > 0 && (
              <p className="text-xs text-green-200 mt-1">{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        {syncMsg && (
          <div className="mt-2 text-xs text-green-100 text-center bg-green-800/50 rounded-lg py-1.5 px-3">
            {syncMsg}
          </div>
        )}
      </div>

      {/* grid de ações */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Novo lançamento</p>
        <div className="grid grid-cols-2 gap-3">
          {MENU_ITEMS.map(item => (
            <button
              key={item.type}
              onClick={() => setScreen(`form-${item.type}` as Screen)}
              className={`flex flex-col items-start p-4 rounded-2xl border text-left active:scale-95 transition-transform ${item.color}`}
            >
              <span className="text-3xl mb-2">{item.emoji}</span>
              <span className="text-sm font-bold leading-tight">{item.label}</span>
              <span className="text-xs opacity-70 leading-tight mt-0.5">{item.desc}</span>
            </button>
          ))}
        </div>

        {/* sync button */}
        {pendingCount > 0 && (
          <button
            onClick={doSync}
            disabled={syncing || !online}
            className="mt-4 w-full py-3 bg-white border-2 border-green-600 text-green-700 rounded-2xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {syncing
              ? <><span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />Sincronizando...</>
              : `🔄 Sincronizar ${pendingCount} registro${pendingCount > 1 ? 's' : ''}`
            }
          </button>
        )}

        {!online && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 text-center">
            Sem internet — os registros serão salvos localmente e enviados quando a conexão for restaurada.
          </div>
        )}

        {/* logout */}
        <button onClick={handleLogout} className="mt-6 text-xs text-gray-400 underline w-full text-center">
          Sair da conta
        </button>
      </div>

      <BottomNav screen={screen} onHome={() => setScreen('home')} onHist={loadHist} />
    </div>
  )
}

// ─── bottom nav ───────────────────────────────────────────────────────────────
function BottomNav({ screen, onHome, onHist }: { screen: Screen; onHome: () => void; onHist: () => void }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex">
      <button
        onClick={onHome}
        className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-medium transition-colors ${screen === 'home' ? 'text-green-700' : 'text-gray-400'}`}
      >
        <span className="text-xl">🏠</span>
        Início
      </button>
      <button
        onClick={onHist}
        className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-medium transition-colors ${screen === 'hist' ? 'text-green-700' : 'text-gray-400'}`}
      >
        <span className="text-xl">📋</span>
        Histórico
      </button>
    </nav>
  )
}
