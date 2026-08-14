import { useState, useEffect } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertTriangle, Trash2, Plus, Save, User, Briefcase,
  Landmark, FileText, CalendarDays, ExternalLink,
} from "lucide-react"
import { useEmployeeRh, type DadosRh, type Documento, type FeriasAusencia } from "@/hooks/useEmployeeRh"
import type { EmployeeWithRelations } from "@/hooks/useEmployees"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—"

const diasParaVencer = (d?: string | null) => {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

const docTipos = [
  "ASO", "RG", "CNH", "CTPS", "PIS/PASEP",
  "NR-12", "NR-33", "NR-35", "NR-10", "NR-18", "NR-06",
  "Certificado de treinamento", "Outros",
]

const feriasTipos: Record<string, string> = {
  ferias:               "Férias",
  afastamento:          "Afastamento",
  licenca_medica:       "Licença médica",
  licenca_maternidade:  "Lic. maternidade",
  licenca_paternidade:  "Lic. paternidade",
  falta:                "Falta",
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
      {children}
    </p>
  )
}

// ─── Tab: Pessoal ─────────────────────────────────────────────────────────────
function TabPessoal({
  dados, saving, onSave,
}: { dados: DadosRh; saving: boolean; onSave: (d: DadosRh) => void }) {
  const [f, setF] = useState<DadosRh>(dados)
  useEffect(() => setF(dados), [dados])
  const set = (k: keyof DadosRh, v: any) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-2 pb-6">
      <SectionTitle>Documentos pessoais</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="RG">
          <Input value={f.rg ?? ""} onChange={e => set("rg", e.target.value)} placeholder="00.000.000-0" />
        </Field>
        <Field label="PIS / PASEP">
          <Input value={f.pis ?? ""} onChange={e => set("pis", e.target.value)} placeholder="000.00000.00-0" />
        </Field>
        <Field label="CTPS">
          <Input value={f.ctps ?? ""} onChange={e => set("ctps", e.target.value)} placeholder="Nº e série" />
        </Field>
        <Field label="CNH (nº)">
          <Input value={f.cnh ?? ""} onChange={e => set("cnh", e.target.value)} placeholder="00000000000" />
        </Field>
        <Field label="Categoria CNH">
          <Select value={f.cnh_categoria ?? ""} onValueChange={v => set("cnh_categoria", v)}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {["A","B","AB","C","D","E","ACC"].map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Vencimento CNH">
          <Input type="date" value={f.cnh_vencimento ?? ""} onChange={e => set("cnh_vencimento", e.target.value)} />
        </Field>
      </div>

      <SectionTitle>Dados pessoais</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de nascimento">
          <Input type="date" value={f.data_nascimento ?? ""} onChange={e => set("data_nascimento", e.target.value)} />
        </Field>
        <Field label="Estado civil">
          <Select value={f.estado_civil ?? ""} onValueChange={v => set("estado_civil", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solteiro">Solteiro(a)</SelectItem>
              <SelectItem value="casado">Casado(a)</SelectItem>
              <SelectItem value="divorciado">Divorciado(a)</SelectItem>
              <SelectItem value="viuvo">Viúvo(a)</SelectItem>
              <SelectItem value="uniao_estavel">União estável</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Escolaridade">
          <Select value={f.escolaridade ?? ""} onValueChange={v => set("escolaridade", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fundamental">Fundamental</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="tecnico">Técnico</SelectItem>
              <SelectItem value="superior">Superior</SelectItem>
              <SelectItem value="pos_graduacao">Pós-graduação</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <SectionTitle>Endereço</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CEP">
          <Input value={f.cep ?? ""} onChange={e => set("cep", e.target.value)} placeholder="00000-000" />
        </Field>
        <Field label="Número">
          <Input value={f.numero ?? ""} onChange={e => set("numero", e.target.value)} placeholder="123" />
        </Field>
        <Field label="Logradouro">
          <Input value={f.logradouro ?? ""} onChange={e => set("logradouro", e.target.value)} placeholder="Rua, Av..." className="col-span-2" />
        </Field>
        <Field label="Complemento">
          <Input value={f.complemento ?? ""} onChange={e => set("complemento", e.target.value)} placeholder="Apto, Bloco..." />
        </Field>
        <Field label="Bairro">
          <Input value={f.bairro ?? ""} onChange={e => set("bairro", e.target.value)} />
        </Field>
        <Field label="Cidade">
          <Input value={f.cidade ?? ""} onChange={e => set("cidade", e.target.value)} />
        </Field>
        <Field label="Estado (UF)">
          <Input value={f.estado ?? ""} onChange={e => set("estado", e.target.value)} maxLength={2} placeholder="SP" />
        </Field>
      </div>

      <SectionTitle>Contato de emergência</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome">
          <Input value={f.emergencia_nome ?? ""} onChange={e => set("emergencia_nome", e.target.value)} />
        </Field>
        <Field label="Telefone">
          <Input value={f.emergencia_telefone ?? ""} onChange={e => set("emergencia_telefone", e.target.value)} placeholder="(11) 99999-9999" />
        </Field>
        <Field label="Parentesco">
          <Input value={f.emergencia_parentesco ?? ""} onChange={e => set("emergencia_parentesco", e.target.value)} placeholder="Cônjuge, Pai, Filho..." />
        </Field>
      </div>

      <div className="pt-4">
        <Button onClick={() => onSave(f)} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar dados pessoais"}
        </Button>
      </div>
    </div>
  )
}

// ─── Tab: Contrato ────────────────────────────────────────────────────────────
function TabContrato({
  dados, saving, onSave,
}: { dados: DadosRh; saving: boolean; onSave: (d: DadosRh) => void }) {
  const [f, setF] = useState<DadosRh>(dados)
  useEffect(() => setF(dados), [dados])
  const set = (k: keyof DadosRh, v: any) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-2 pb-6">
      <SectionTitle>Tipo e carga horária</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de contrato">
          <Select value={f.tipo_contrato ?? ""} onValueChange={v => set("tipo_contrato", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clt">CLT</SelectItem>
              <SelectItem value="pj">PJ</SelectItem>
              <SelectItem value="temporario">Temporário</SelectItem>
              <SelectItem value="estagio">Estágio</SelectItem>
              <SelectItem value="terceiro">Terceirizado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Jornada (horas semanais)">
          <Input
            type="number" min={0} max={60}
            value={f.jornada_horas ?? ""}
            onChange={e => set("jornada_horas", e.target.value ? Number(e.target.value) : null)}
            placeholder="44"
          />
        </Field>
      </div>

      <SectionTitle>Remuneração</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Salário base (R$)">
          <Input
            type="number" min={0} step={0.01}
            value={f.salario_base ?? ""}
            onChange={e => set("salario_base", e.target.value ? Number(e.target.value) : null)}
            placeholder="0,00"
          />
        </Field>
      </div>

      <SectionTitle>Desligamento</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de demissão">
          <Input type="date" value={f.data_demissao ?? ""} onChange={e => set("data_demissao", e.target.value)} />
        </Field>
        <Field label="Motivo de desligamento">
          <Select value={f.motivo_demissao ?? ""} onValueChange={v => set("motivo_demissao", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pedido_demissao">Pedido de demissão</SelectItem>
              <SelectItem value="dispensa_sem_justa_causa">Dispensa sem justa causa</SelectItem>
              <SelectItem value="dispensa_com_justa_causa">Dispensa com justa causa</SelectItem>
              <SelectItem value="fim_contrato">Fim de contrato</SelectItem>
              <SelectItem value="aposentadoria">Aposentadoria</SelectItem>
              <SelectItem value="falecimento">Falecimento</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <SectionTitle>Observações gerais</SectionTitle>
      <Field label="">
        <textarea
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          value={f.observacoes ?? ""}
          onChange={e => set("observacoes", e.target.value)}
          placeholder="Informações adicionais sobre o contrato..."
        />
      </Field>

      <div className="pt-4">
        <Button onClick={() => onSave(f)} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar dados do contrato"}
        </Button>
      </div>
    </div>
  )
}

// ─── Tab: Financeiro ──────────────────────────────────────────────────────────
function TabFinanceiro({
  dados, saving, onSave,
}: { dados: DadosRh; saving: boolean; onSave: (d: DadosRh) => void }) {
  const [f, setF] = useState<DadosRh>(dados)
  useEffect(() => setF(dados), [dados])
  const set = (k: keyof DadosRh, v: any) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-2 pb-6">
      <SectionTitle>Dados bancários</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banco">
          <Input value={f.banco ?? ""} onChange={e => set("banco", e.target.value)} placeholder="Ex: Bradesco, Itaú, Nubank" />
        </Field>
        <Field label="Agência">
          <Input value={f.agencia ?? ""} onChange={e => set("agencia", e.target.value)} placeholder="0000" />
        </Field>
        <Field label="Conta">
          <Input value={f.conta ?? ""} onChange={e => set("conta", e.target.value)} placeholder="00000-0" />
        </Field>
        <Field label="Tipo de conta">
          <Select value={f.tipo_conta ?? ""} onValueChange={v => set("tipo_conta", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="corrente">Corrente</SelectItem>
              <SelectItem value="poupanca">Poupança</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Chave PIX">
          <Input value={f.pix ?? ""} onChange={e => set("pix", e.target.value)} placeholder="CPF, e-mail, celular ou chave aleatória" className="col-span-2" />
        </Field>
      </div>

      <SectionTitle>Benefícios</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vale alimentação (R$/mês)">
          <Input
            type="number" min={0} step={0.01}
            value={f.vale_alimentacao ?? ""}
            onChange={e => set("vale_alimentacao", e.target.value ? Number(e.target.value) : null)}
            placeholder="0,00"
          />
        </Field>
        <Field label="Vale transporte (R$/mês)">
          <Input
            type="number" min={0} step={0.01}
            value={f.vale_transporte ?? ""}
            onChange={e => set("vale_transporte", e.target.value ? Number(e.target.value) : null)}
            placeholder="0,00"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-2">
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Plano de saúde</p>
            <p className="text-xs text-muted-foreground">Convênio médico</p>
          </div>
          <Switch
            checked={f.plano_saude ?? false}
            onCheckedChange={v => set("plano_saude", v)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Plano odontológico</p>
            <p className="text-xs text-muted-foreground">Convênio dental</p>
          </div>
          <Switch
            checked={f.plano_odonto ?? false}
            onCheckedChange={v => set("plano_odonto", v)}
          />
        </div>
      </div>

      {/* Resumo */}
      {(f.salario_base || f.vale_alimentacao || f.vale_transporte) && (
        <div className="mt-4 rounded-lg bg-muted/40 border border-border/50 p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custo total estimado/mês</p>
          {f.salario_base && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Salário base</span>
              <span className="font-medium">R$ {Number(f.salario_base).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {f.vale_alimentacao && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vale alimentação</span>
              <span>R$ {Number(f.vale_alimentacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {f.vale_transporte && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vale transporte</span>
              <span>R$ {Number(f.vale_transporte).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>R$ {(
              Number(f.salario_base ?? 0) +
              Number(f.vale_alimentacao ?? 0) +
              Number(f.vale_transporte ?? 0)
            ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}

      <div className="pt-4">
        <Button onClick={() => onSave(f)} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar dados financeiros"}
        </Button>
      </div>
    </div>
  )
}

// ─── Tab: Documentos ──────────────────────────────────────────────────────────
function TabDocumentos({
  documentos, saving,
  onAdd, onRemove,
}: {
  documentos: Documento[]
  saving: boolean
  onAdd: (d: Omit<Documento, "id">) => void
  onRemove: (id: string) => void
}) {
  const [form, setForm] = useState<Omit<Documento, "id">>({
    tipo: "", descricao: "", arquivo_url: "", data_emissao: "", data_vencimento: "",
  })
  const [showForm, setShowForm] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleAdd = () => {
    if (!form.tipo) return
    onAdd(form)
    setForm({ tipo: "", descricao: "", arquivo_url: "", data_emissao: "", data_vencimento: "" })
    setShowForm(false)
  }

  const vencBadge = (d?: string | null) => {
    const dias = diasParaVencer(d)
    if (dias === null) return null
    if (dias < 0)  return <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">Vencido {fmt(d)}</Badge>
    if (dias <= 30) return <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Vence em {dias}d</Badge>
    return <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">Válido até {fmt(d)}</Badge>
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {documentos.length} documento{documentos.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">Novo documento</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo *">
              <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {docTipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição">
              <Input value={form.descricao ?? ""} onChange={e => set("descricao", e.target.value)} placeholder="Descrição breve" />
            </Field>
            <Field label="Data de emissão">
              <Input type="date" value={form.data_emissao ?? ""} onChange={e => set("data_emissao", e.target.value)} />
            </Field>
            <Field label="Data de vencimento">
              <Input type="date" value={form.data_vencimento ?? ""} onChange={e => set("data_vencimento", e.target.value)} />
            </Field>
            <Field label="URL do arquivo">
              <Input value={form.arquivo_url ?? ""} onChange={e => set("arquivo_url", e.target.value)} placeholder="https://..." className="col-span-2" />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={!form.tipo || saving}>
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </div>
      )}

      {documentos.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum documento cadastrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map(doc => {
            const dias = diasParaVencer(doc.data_vencimento)
            const expirado = dias !== null && dias < 0
            const aVencer  = dias !== null && dias >= 0 && dias <= 30
            return (
              <div
                key={doc.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  expirado ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
                  : aVencer ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"
                  : "border-border/50 bg-card"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{doc.tipo}</span>
                    {doc.descricao && <span className="text-xs text-muted-foreground">— {doc.descricao}</span>}
                    {vencBadge(doc.data_vencimento)}
                    {(expirado || aVencer) && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                  </div>
                  {doc.data_emissao && (
                    <p className="text-xs text-muted-foreground mt-0.5">Emitido: {fmt(doc.data_emissao)}</p>
                  )}
                </div>
                {doc.arquivo_url && (
                  <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer" title="Abrir arquivo">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => doc.id && onRemove(doc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Férias / Ausências ──────────────────────────────────────────────────
function TabFerias({
  ferias, saving,
  onAdd, onRemove,
}: {
  ferias: FeriasAusencia[]
  saving: boolean
  onAdd: (f: Omit<FeriasAusencia, "id">) => void
  onRemove: (id: string) => void
}) {
  const [form, setForm] = useState<Omit<FeriasAusencia, "id">>({
    tipo: "ferias", data_inicio: "", data_fim: "", motivo: "", observacoes: "",
  })
  const [showForm, setShowForm] = useState(false)
  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleAdd = () => {
    if (!form.tipo || !form.data_inicio) return
    onAdd(form)
    setForm({ tipo: "ferias", data_inicio: "", data_fim: "", motivo: "", observacoes: "" })
    setShowForm(false)
  }

  const tipoCor: Record<string, string> = {
    ferias:              "bg-blue-100 text-blue-700",
    afastamento:         "bg-red-100 text-red-700",
    licenca_medica:      "bg-amber-100 text-amber-700",
    licenca_maternidade: "bg-pink-100 text-pink-700",
    licenca_paternidade: "bg-violet-100 text-violet-700",
    falta:               "bg-slate-100 text-slate-600",
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {ferias.length} registro{ferias.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">Novo registro</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo *">
              <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(feriasTipos).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de início *">
              <Input type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} />
            </Field>
            <Field label="Data de fim">
              <Input type="date" value={form.data_fim ?? ""} onChange={e => set("data_fim", e.target.value)} />
            </Field>
            {form.tipo === "afastamento" || form.tipo === "licenca_medica" ? (
              <Field label="CID">
                <Input value={form.cid ?? ""} onChange={e => set("cid", e.target.value)} placeholder="Ex: M54" />
              </Field>
            ) : null}
            {form.tipo === "ferias" && (
              <>
                <Field label="Período aquisitivo — início">
                  <Input type="date" value={form.periodo_aquisitivo_inicio ?? ""} onChange={e => set("periodo_aquisitivo_inicio", e.target.value)} />
                </Field>
                <Field label="Período aquisitivo — fim">
                  <Input type="date" value={form.periodo_aquisitivo_fim ?? ""} onChange={e => set("periodo_aquisitivo_fim", e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Motivo / obs.">
              <Input value={form.motivo ?? ""} onChange={e => set("motivo", e.target.value)} className="col-span-2" />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={!form.tipo || !form.data_inicio || saving}>
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </div>
      )}

      {ferias.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum registro de férias ou ausência</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ferias.map(f => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${tipoCor[f.tipo] ?? "bg-slate-100 text-slate-600"} border-0 text-[10px]`}>
                    {feriasTipos[f.tipo] ?? f.tipo}
                  </Badge>
                  <span className="text-sm font-medium">{fmt(f.data_inicio)}</span>
                  {f.data_fim && <span className="text-xs text-muted-foreground">→ {fmt(f.data_fim)}</span>}
                  {f.cid && <span className="text-xs text-muted-foreground">CID: {f.cid}</span>}
                </div>
                {f.motivo && <p className="text-xs text-muted-foreground mt-0.5">{f.motivo}</p>}
                {f.periodo_aquisitivo_inicio && (
                  <p className="text-xs text-muted-foreground">
                    P. aquis.: {fmt(f.periodo_aquisitivo_inicio)} → {fmt(f.periodo_aquisitivo_fim)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => f.id && onRemove(f.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  employee: EmployeeWithRelations | null
}

export function PerfilRhSheet({ open, onOpenChange, employee }: Props) {
  const { loading, saving, dadosRh, documentos, ferias, documentosVencendo,
          saveDadosRh, addDocumento, removeDocumento, addFerias, removeFerias,
  } = useEmployeeRh(open && employee ? employee.id : null)

  if (!employee) return null

  const iniciais = employee.nome.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        {/* Header do funcionário */}
        <div className="sticky top-0 z-10 bg-background border-b border-border/60 px-6 py-4">
          <SheetHeader>
            <SheetTitle className="text-left">Perfil RH</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3 mt-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={employee.foto_url || undefined} />
              <AvatarFallback className="text-sm font-semibold">{iniciais}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{employee.nome}</p>
              <p className="text-xs text-muted-foreground">{employee.cargos?.nome} · {employee.departamentos?.nome}</p>
            </div>
            {documentosVencendo.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-0 text-xs flex-shrink-0">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {documentosVencendo.length} doc. a vencer
              </Badge>
            )}
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
              Carregando dados de RH...
            </div>
          ) : (
            <Tabs defaultValue="pessoal" className="w-full">
              <TabsList className="grid grid-cols-5 w-full mb-4">
                <TabsTrigger value="pessoal" className="text-xs px-1">
                  <User className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Pessoal</span>
                </TabsTrigger>
                <TabsTrigger value="contrato" className="text-xs px-1">
                  <Briefcase className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Contrato</span>
                </TabsTrigger>
                <TabsTrigger value="financeiro" className="text-xs px-1">
                  <Landmark className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Financeiro</span>
                </TabsTrigger>
                <TabsTrigger value="documentos" className="text-xs px-1 relative">
                  <FileText className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Documentos</span>
                  {documentosVencendo.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 text-white text-[8px] flex items-center justify-center font-bold">
                      {documentosVencendo.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ferias" className="text-xs px-1">
                  <CalendarDays className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Férias</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pessoal">
                <TabPessoal dados={dadosRh} saving={saving} onSave={saveDadosRh} />
              </TabsContent>
              <TabsContent value="contrato">
                <TabContrato dados={dadosRh} saving={saving} onSave={saveDadosRh} />
              </TabsContent>
              <TabsContent value="financeiro">
                <TabFinanceiro dados={dadosRh} saving={saving} onSave={saveDadosRh} />
              </TabsContent>
              <TabsContent value="documentos">
                <TabDocumentos
                  documentos={documentos} saving={saving}
                  onAdd={addDocumento} onRemove={removeDocumento}
                />
              </TabsContent>
              <TabsContent value="ferias">
                <TabFerias
                  ferias={ferias} saving={saving}
                  onAdd={addFerias} onRemove={removeFerias}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
