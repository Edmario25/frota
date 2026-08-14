import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DadosRh {
  id?: string
  // pessoal
  data_nascimento?: string | null
  estado_civil?: string | null
  escolaridade?: string | null
  rg?: string | null
  ctps?: string | null
  pis?: string | null
  cnh?: string | null
  cnh_categoria?: string | null
  cnh_vencimento?: string | null
  // endereço
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  // emergência
  emergencia_nome?: string | null
  emergencia_telefone?: string | null
  emergencia_parentesco?: string | null
  // contrato
  tipo_contrato?: string | null
  salario_base?: number | null
  jornada_horas?: number | null
  data_demissao?: string | null
  motivo_demissao?: string | null
  // bancário
  banco?: string | null
  agencia?: string | null
  conta?: string | null
  tipo_conta?: string | null
  pix?: string | null
  vale_alimentacao?: number | null
  vale_transporte?: number | null
  plano_saude?: boolean
  plano_odonto?: boolean
  observacoes?: string | null
}

export interface Documento {
  id?: string
  tipo: string
  descricao?: string | null
  arquivo_url?: string | null
  data_emissao?: string | null
  data_vencimento?: string | null
  observacoes?: string | null
}

export interface FeriasAusencia {
  id?: string
  tipo: string
  data_inicio: string
  data_fim?: string | null
  dias_corridos?: number | null
  periodo_aquisitivo_inicio?: string | null
  periodo_aquisitivo_fim?: string | null
  cid?: string | null
  motivo?: string | null
  aprovado?: boolean
  observacoes?: string | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useEmployeeRh(employeeId: string | null) {
  const { toast } = useToast()
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [dadosRh,    setDadosRh]    = useState<DadosRh>({})
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [ferias,     setFerias]     = useState<FeriasAusencia[]>([])

  const refetch = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const [rhRes, docsRes, ferRes] = await Promise.all([
        (supabase as any).from("employee_dados_rh")
          .select("*").eq("employee_id", employeeId).maybeSingle(),
        (supabase as any).from("employee_documentos")
          .select("*").eq("employee_id", employeeId).order("data_vencimento"),
        (supabase as any).from("employee_ferias")
          .select("*").eq("employee_id", employeeId).order("data_inicio", { ascending: false }),
      ])
      setDadosRh(rhRes.data ?? {})
      setDocumentos(docsRes.data ?? [])
      setFerias(ferRes.data ?? [])
    } catch (e) {
      console.error("[useEmployeeRh] refetch error", e)
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => { refetch() }, [refetch])

  // ── Salva dados RH (upsert) ────────────────────────────────────────────────
  const saveDadosRh = async (data: DadosRh) => {
    if (!employeeId) return
    setSaving(true)
    try {
      if (dadosRh.id) {
        const { error } = await (supabase as any)
          .from("employee_dados_rh")
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq("id", dadosRh.id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from("employee_dados_rh")
          .insert({ ...data, employee_id: employeeId })
        if (error) throw error
      }
      toast({ title: "Dados salvos com sucesso" })
      await refetch()
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // ── Documentos ─────────────────────────────────────────────────────────────
  const addDocumento = async (doc: Omit<Documento, "id">) => {
    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from("employee_documentos")
        .insert({ ...doc, employee_id: employeeId })
      if (error) throw error
      toast({ title: "Documento adicionado" })
      await refetch()
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const removeDocumento = async (id: string) => {
    try {
      await (supabase as any).from("employee_documentos").delete().eq("id", id)
      setDocumentos(prev => prev.filter(d => d.id !== id))
      toast({ title: "Documento removido" })
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    }
  }

  // ── Férias/Ausências ───────────────────────────────────────────────────────
  const addFerias = async (f: Omit<FeriasAusencia, "id">) => {
    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from("employee_ferias")
        .insert({ ...f, employee_id: employeeId })
      if (error) throw error
      toast({ title: "Registro adicionado" })
      await refetch()
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const removeFerias = async (id: string) => {
    try {
      await (supabase as any).from("employee_ferias").delete().eq("id", id)
      setFerias(prev => prev.filter(f => f.id !== id))
      toast({ title: "Registro removido" })
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" })
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const documentosVencendo = documentos.filter(d => {
    if (!d.data_vencimento) return false
    const diff = (new Date(d.data_vencimento).getTime() - Date.now()) / 86400000
    return diff <= 30
  })

  return {
    loading, saving,
    dadosRh, documentos, ferias,
    documentosVencendo,
    saveDadosRh,
    addDocumento, removeDocumento,
    addFerias, removeFerias,
    refetch,
  }
}
