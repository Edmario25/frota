import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Plus, Trash2, ChevronDown, ChevronRight, Users, HardHat, UserPlus, X,
} from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Equipe {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  encarregado: { id: string; nome: string } | null
  membros: Membro[]
}
interface Membro {
  id: string        // equipe_membro.id
  employee_id: string
  funcao: string | null
  ativo: boolean
  employee: { nome: string; cargo: string | null }
}
interface FuncRef { id: string; nome: string; cargo: string | null }

interface Props {
  isOpen: boolean
  onClose: () => void
  obra: { id: string; nome: string } | null
}

// ─── Component ────────────────────────────────────────────────────────────────
export function EquipesObraModal({ isOpen, onClose, obra }: Props) {
  const { toast } = useToast()
  const [equipes, setEquipes]           = useState<Equipe[]>([])
  const [funcionarios, setFuncionarios] = useState<FuncRef[]>([])
  const [loading, setLoading]           = useState(false)
  const [expandido, setExpandido]       = useState<string | null>(null)

  // Nova equipe
  const [showNovaEquipe, setShowNovaEquipe] = useState(false)
  const [novoNome, setNovoNome]             = useState("")
  const [novoDesc, setNovoDesc]             = useState("")
  const [novoEncarregado, setNovoEnc]       = useState("")
  const [salvandoEq, setSalvandoEq]         = useState(false)

  // Adicionar membro
  const [addingTo, setAddingTo]   = useState<string | null>(null)
  const [membroSel, setMembroSel] = useState("")
  const [funcaoSel, setFuncaoSel] = useState("")

  useEffect(() => {
    if (isOpen && obra) { fetchAll() }
  }, [isOpen, obra])

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchEquipes(), fetchFuncionarios()])
    setLoading(false)
  }

  const fetchEquipes = async () => {
    if (!obra) return
    const { data } = await (supabase as any)
      .from("obra_equipes")
      .select(`
        id, nome, descricao, ativo,
        encarregado:employees!obra_equipes_encarregado_id_fkey(id, nome),
        obra_equipe_membros(
          id, employee_id, funcao, ativo,
          employees(nome, cargos(nome))
        )
      `)
      .eq("obra_id", obra.id)
      .eq("ativo", true)
      .order("nome")

    setEquipes(
      (data ?? []).map((eq: any) => ({
        ...eq,
        encarregado: eq.encarregado ?? null,
        membros: (eq.obra_equipe_membros ?? []).map((m: any) => ({
          id: m.id,
          employee_id: m.employee_id,
          funcao: m.funcao,
          ativo: m.ativo,
          employee: { nome: m.employees?.nome ?? "—", cargo: m.employees?.cargos?.nome ?? null },
        })),
      }))
    )
  }

  const fetchFuncionarios = async () => {
    if (!obra) return
    const { data } = await (supabase as any)
      .from("obra_funcionarios")
      .select("employee_id, employees(id, nome, cargos(nome), status)")
      .eq("obra_id", obra.id)
      .eq("status", true)
    setFuncionarios((data ?? []).filter((v: any) => v.employees?.status === "ativo").map((v: any) => ({
      id: v.employees.id, nome: v.employees.nome, cargo: v.employees.cargos?.nome ?? null,
    })))
  }

  // ── Nova equipe ───────────────────────────────────────────────────────────

  const criarEquipe = async () => {
    if (!novoNome.trim() || !obra) return
    setSalvandoEq(true)
    const { error } = await (supabase as any).from("obra_equipes").insert({
      obra_id: obra.id,
      nome: novoNome.trim(),
      descricao: novoDesc.trim() || null,
      encarregado_id: novoEncarregado || null,
    })
    setSalvandoEq(false)
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return }
    setNovoNome(""); setNovoDesc(""); setNovoEnc("")
    setShowNovaEquipe(false)
    toast({ title: "Equipe criada!" })
    fetchEquipes()
  }

  const excluirEquipe = async (id: string) => {
    const { error } = await (supabase as any).from("obra_equipes").update({ ativo: false }).eq("id", id)
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return }
    toast({ title: "Equipe removida" })
    fetchEquipes()
  }

  // ── Membros ───────────────────────────────────────────────────────────────

  const adicionarMembro = async (equipeId: string) => {
    if (!membroSel) return
    const { data: anterior } = await (supabase as any).from("obra_equipe_membros").select("id").eq("equipe_id", equipeId).eq("employee_id", membroSel).maybeSingle()
    const operacao = anterior
      ? (supabase as any).from("obra_equipe_membros").update({ ativo: true, funcao: funcaoSel.trim() || null }).eq("id", anterior.id)
      : (supabase as any).from("obra_equipe_membros").insert({ equipe_id: equipeId, employee_id: membroSel, funcao: funcaoSel.trim() || null })
    const { error } = await operacao
    if (error) {
      toast({ title: "Erro", description: error.message.includes("unique") ? "Funcionário já está nessa equipe." : error.message, variant: "destructive" })
      return
    }
    setMembroSel(""); setFuncaoSel(""); setAddingTo(null)
    toast({ title: "Membro adicionado!" })
    fetchEquipes()
  }

  const removerMembro = async (membroId: string) => {
    await (supabase as any).from("obra_equipe_membros").update({ ativo: false }).eq("id", membroId)
    fetchEquipes()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!obra) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-500" />
            Equipes — {obra.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Botão nova equipe */}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNovaEquipe(v => !v)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Equipe
            </Button>
          </div>

          {/* Formulário nova equipe */}
          {showNovaEquipe && (
            <div className="border border-border/60 rounded-xl p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold">Nova Equipe</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome da equipe *</Label>
                  <Input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                    placeholder="Ex: Equipe Estrutura" className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Encarregado</Label>
                  <Select value={novoEncarregado} onValueChange={setNovoEnc}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input value={novoDesc} onChange={e => setNovoDesc(e.target.value)}
                  placeholder="Responsabilidade da equipe..." className="mt-1 h-8 text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowNovaEquipe(false)}>Cancelar</Button>
                <Button size="sm" onClick={criarEquipe} disabled={salvandoEq || !novoNome.trim()}>
                  {salvandoEq ? "Salvando..." : "Criar Equipe"}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de equipes */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
          ) : equipes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma equipe cadastrada para esta obra</p>
              <p className="text-xs mt-1 opacity-70">Clique em "Nova Equipe" para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {equipes.map(eq => (
                <div key={eq.id} className="border border-border/60 rounded-xl overflow-hidden">
                  {/* Header da equipe */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandido(expandido === eq.id ? null : eq.id)}
                  >
                    {expandido === eq.id
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    }
                    <HardHat className="h-4 w-4 text-violet-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{eq.nome}</p>
                      {eq.encarregado && (
                        <p className="text-xs text-muted-foreground">Encarregado: {eq.encarregado.nome}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {eq.membros.filter(m => m.ativo).length} membros
                    </Badge>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      onClick={e => { e.stopPropagation(); excluirEquipe(eq.id) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Membros */}
                  {expandido === eq.id && (
                    <div className="px-4 pb-4 pt-2 space-y-2">
                      {eq.membros.filter(m => m.ativo).length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Nenhum membro ainda</p>
                      ) : (
                        eq.membros.filter(m => m.ativo).map(m => (
                          <div key={m.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/30">
                            <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-violet-700">
                                {m.employee.nome.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight">{m.employee.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.funcao ?? m.employee.cargo ?? "—"}
                              </p>
                            </div>
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-red-500"
                              onClick={() => removerMembro(m.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}

                      {/* Adicionar membro */}
                      {addingTo === eq.id ? (
                        <div className="border border-dashed border-border rounded-lg p-3 space-y-2 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Funcionário</Label>
                              <Select value={membroSel} onValueChange={setMembroSel}>
                                <SelectTrigger className="mt-1 h-8 text-sm">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  {funcionarios
                                    .filter(f => !eq.membros.some(m => m.employee_id === f.id && m.ativo))
                                    .map(f => (
                                      <SelectItem key={f.id} value={f.id}>
                                        {f.nome}{f.cargo ? ` — ${f.cargo}` : ""}
                                      </SelectItem>
                                    ))
                                  }
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Função na equipe</Label>
                              <Input value={funcaoSel} onChange={e => setFuncaoSel(e.target.value)}
                                placeholder="Ex: Pedreiro, Armador" className="mt-1 h-8 text-sm" />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => { setAddingTo(null); setMembroSel(""); setFuncaoSel("") }}>
                              Cancelar
                            </Button>
                            <Button size="sm" className="h-7 text-xs"
                              onClick={() => adicionarMembro(eq.id)} disabled={!membroSel}>
                              Adicionar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          className="w-full mt-1 h-8 text-xs border-dashed"
                          onClick={() => { setAddingTo(eq.id); setMembroSel(""); setFuncaoSel("") }}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                          Adicionar Membro
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
