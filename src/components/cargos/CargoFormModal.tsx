import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, Car, Calendar, Wrench, Users, Wallet,
  BarChart3, ShieldCheck, AlertOctagon, ClipboardList,
  BookOpen, FileWarning, Package, GraduationCap, UserCheck,
  FileText, Globe, Shield, ShieldAlert, Boxes,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Cargo = Database['public']['Tables']['cargos']['Row'];
type CargoInsert = Database['public']['Tables']['cargos']['Insert'];

// ─── Schema ──────────────────────────────────────────────────────────────────
const schema = z.object({
  nome:              z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  descricao:         z.string().optional(),
  nivel_hierarquico: z.number().min(1).max(10),
  nivel_acesso:      z.enum(["funcionario", "gestor_obra", "gestor_contrato"]),

  // Escopo
  acessa_todas_obras:      z.boolean().default(false),

  // Operacional
  acesso_dashboard:        z.boolean().default(false),
  acesso_frota:            z.boolean().default(false),
  acesso_escalas:          z.boolean().default(false),
  acesso_manutencao:       z.boolean().default(false),
  acesso_colaboradores:    z.boolean().default(false),
  acesso_fundo_fixo:       z.boolean().default(false),
  acesso_relatorios:       z.boolean().default(false),
  acesso_fornecedores:     z.boolean().default(false),

  // SMS
  acesso_sms_dashboard:    z.boolean().default(false),
  acesso_sms_desvios:      z.boolean().default(false),
  acesso_sms_inspecoes:    z.boolean().default(false),
  acesso_sms_apr:          z.boolean().default(false),
  acesso_sms_dds:          z.boolean().default(false),
  acesso_sms_epis:         z.boolean().default(false),
  acesso_sms_treinamentos: z.boolean().default(false),
  acesso_sms_admissao:     z.boolean().default(false),
  acesso_sms_rdo:          z.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

// ─── Grupos de permissão para o UI ───────────────────────────────────────────
const PERM_GROUPS = [
  {
    label: "Operacional / Frota",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    items: [
      { key: "acesso_dashboard",     icon: LayoutDashboard, label: "Dashboard",        desc: "Visão geral e indicadores" },
      { key: "acesso_frota",         icon: Car,             label: "Veículos / Frota",  desc: "Gestão de veículos leves e pesados" },
      { key: "acesso_escalas",       icon: Calendar,        label: "Escalas",           desc: "Escalas e viagens" },
      { key: "acesso_manutencao",    icon: Wrench,          label: "Manutenção",        desc: "Ordens de serviço e preventiva" },
      { key: "acesso_colaboradores", icon: Users,           label: "Funcionários",      desc: "Gestão de pessoas e RH" },
      { key: "acesso_fundo_fixo",    icon: Wallet,          label: "Fundo Fixo",        desc: "Lançar despesas no caixa da obra" },
      { key: "acesso_relatorios",    icon: BarChart3,       label: "Relatórios",        desc: "Relatórios gerenciais e exportações" },
      { key: "acesso_fornecedores",  icon: Boxes,           label: "Fornecedores",      desc: "Cadastro e contratos de fornecedores" },
    ],
  },
  {
    label: "SMS / Segurança do Trabalho",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    items: [
      { key: "acesso_sms_dashboard",    icon: ShieldCheck,   label: "Painel SMS",         desc: "Visão geral de segurança" },
      { key: "acesso_sms_desvios",      icon: AlertOctagon,  label: "Desvios",             desc: "Registrar e acompanhar desvios" },
      { key: "acesso_sms_inspecoes",    icon: ClipboardList, label: "Inspeções",           desc: "Checklists de inspeção" },
      { key: "acesso_sms_apr",          icon: FileWarning,   label: "APR",                 desc: "Análise Preliminar de Risco" },
      { key: "acesso_sms_dds",          icon: BookOpen,      label: "DDS",                 desc: "Diálogo Diário de Segurança" },
      { key: "acesso_sms_epis",         icon: Package,       label: "EPIs",                desc: "Controle de equipamentos de proteção" },
      { key: "acesso_sms_treinamentos", icon: GraduationCap, label: "Treinamentos",        desc: "Treinamentos e certificações" },
      { key: "acesso_sms_admissao",     icon: UserCheck,     label: "Admissão Digital",    desc: "Integração e admissão de colaboradores" },
      { key: "acesso_sms_rdo",          icon: FileText,      label: "RDO",                 desc: "Relatório Diário de Obra" },
    ],
  },
] as const;

// ─── Tipos para helpers ───────────────────────────────────────────────────────
type BooleanField = keyof Pick<FormValues,
  | "acessa_todas_obras"
  | "acesso_dashboard" | "acesso_frota" | "acesso_escalas"
  | "acesso_manutencao" | "acesso_colaboradores" | "acesso_fundo_fixo"
  | "acesso_relatorios" | "acesso_fornecedores" | "acesso_sms_dashboard" | "acesso_sms_desvios"
  | "acesso_sms_inspecoes" | "acesso_sms_apr" | "acesso_sms_dds"
  | "acesso_sms_epis" | "acesso_sms_treinamentos" | "acesso_sms_admissao"
  | "acesso_sms_rdo"
>;

// ─── Defaults ─────────────────────────────────────────────────────────────────
const emptyForm = (): FormValues => ({
  nome: "", descricao: "", nivel_hierarquico: 1, nivel_acesso: "funcionario",
  acessa_todas_obras: false, acesso_dashboard: false, acesso_frota: false,
  acesso_escalas: false, acesso_manutencao: false, acesso_colaboradores: false,
  acesso_fundo_fixo: false, acesso_relatorios: false,
  acesso_fornecedores: false,
  acesso_sms_dashboard: false, acesso_sms_desvios: false, acesso_sms_inspecoes: false,
  acesso_sms_apr: false, acesso_sms_dds: false, acesso_sms_epis: false,
  acesso_sms_treinamentos: false, acesso_sms_admissao: false, acesso_sms_rdo: false,
});

const fromCargo = (c: Cargo): FormValues => ({
  nome:              c.nome ?? "",
  descricao:         c.descricao ?? "",
  nivel_hierarquico: c.nivel_hierarquico ?? 1,
  nivel_acesso:      (c.nivel_acesso as any) ?? "funcionario",
  acessa_todas_obras:      (c as any).acessa_todas_obras      ?? false,
  acesso_dashboard:        (c as any).acesso_dashboard        ?? false,
  acesso_frota:            (c as any).acesso_frota            ?? false,
  acesso_escalas:          (c as any).acesso_escalas          ?? false,
  acesso_manutencao:       (c as any).acesso_manutencao       ?? false,
  acesso_colaboradores:    (c as any).acesso_colaboradores    ?? false,
  acesso_fundo_fixo:       c.acesso_fundo_fixo               ?? false,
  acesso_relatorios:       (c as any).acesso_relatorios       ?? false,
  acesso_fornecedores:     (c as any).acesso_fornecedores     ?? false,
  acesso_sms_dashboard:    (c as any).acesso_sms_dashboard    ?? false,
  acesso_sms_desvios:      (c as any).acesso_sms_desvios      ?? false,
  acesso_sms_inspecoes:    (c as any).acesso_sms_inspecoes    ?? false,
  acesso_sms_apr:          (c as any).acesso_sms_apr          ?? false,
  acesso_sms_dds:          (c as any).acesso_sms_dds          ?? false,
  acesso_sms_epis:         (c as any).acesso_sms_epis         ?? false,
  acesso_sms_treinamentos: (c as any).acesso_sms_treinamentos ?? false,
  acesso_sms_admissao:     (c as any).acesso_sms_admissao     ?? false,
  acesso_sms_rdo:          (c as any).acesso_sms_rdo          ?? false,
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo?: Cargo;
  onSubmit: (data: CargoInsert) => Promise<void>;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export const CargoFormModal = ({ open, onOpenChange, cargo, onSubmit }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    form.reset(cargo ? fromCargo(cargo) : emptyForm());
  }, [cargo, open]);

  // Atalhos: "Selecionar todos" por grupo
  function toggleGroup(keys: string[], value: boolean) {
    keys.forEach(k => form.setValue(k as BooleanField, value));
  }

  const allOperacional = PERM_GROUPS[0].items.map(i => i.key);
  const allSms         = PERM_GROUPS[1].items.map(i => i.key);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        nome:              values.nome,
        descricao:         values.descricao || null,
        nivel_hierarquico: values.nivel_hierarquico,
        nivel_acesso:      values.nivel_acesso,
        acesso_fundo_fixo: values.acesso_fundo_fixo,
        // Permissões granulares
        ...({ acessa_todas_obras:      values.acessa_todas_obras } as any),
        ...({ acesso_dashboard:        values.acesso_dashboard } as any),
        ...({ acesso_frota:            values.acesso_frota } as any),
        ...({ acesso_escalas:          values.acesso_escalas } as any),
        ...({ acesso_manutencao:       values.acesso_manutencao } as any),
        ...({ acesso_colaboradores:    values.acesso_colaboradores } as any),
        ...({ acesso_relatorios:       values.acesso_relatorios } as any),
        ...({ acesso_sms_dashboard:    values.acesso_sms_dashboard } as any),
        ...({ acesso_sms_desvios:      values.acesso_sms_desvios } as any),
        ...({ acesso_sms_inspecoes:    values.acesso_sms_inspecoes } as any),
        ...({ acesso_sms_apr:          values.acesso_sms_apr } as any),
        ...({ acesso_sms_dds:          values.acesso_sms_dds } as any),
        ...({ acesso_sms_epis:         values.acesso_sms_epis } as any),
        ...({ acesso_sms_treinamentos: values.acesso_sms_treinamentos } as any),
        ...({ acesso_sms_admissao:     values.acesso_sms_admissao } as any),
        ...({ acesso_sms_rdo:          values.acesso_sms_rdo } as any),
      } as CargoInsert);
      onOpenChange(false);
      form.reset();
    } catch {
      // erro tratado no hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            {cargo ? "Editar Cargo" : "Novo Cargo"}
          </DialogTitle>
          <DialogDescription>
            Defina o nome, hierarquia e quais módulos este cargo pode acessar
          </DialogDescription>
        </DialogHeader>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form id="cargo-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

              {/* ─── Informações básicas ──────────────────────── */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Cargo <span className="text-red-500">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Técnico de Segurança do Trabalho..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="nivel_hierarquico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nível Hierárquico</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min="1" max="10"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nivel_acesso"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Classificação</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="funcionario">Funcionário</SelectItem>
                            <SelectItem value="gestor_obra">Gestor de Obras</SelectItem>
                            <SelectItem value="gestor_contrato">Gestor de Contratos</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descreva as responsabilidades deste cargo..." rows={2} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* ─── Escopo de obras ──────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-violet-500" />
                  Escopo de Acesso
                </h3>
                <FormField
                  control={form.control}
                  name="acessa_todas_obras"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center flex-shrink-0">
                            <ShieldAlert className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Acessa todas as obras</p>
                            <p className="text-xs text-muted-foreground">Quando ativo, não precisa ser vinculado a obras individualmente</p>
                          </div>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* ─── Grupos de permissões ─────────────────────── */}
              {PERM_GROUPS.map((group, gi) => {
                const allKeys = group.items.map(i => i.key);
                const watchedKeys = form.watch(allKeys as any[]);
                const allOn  = watchedKeys.every(Boolean);
                const allOff = watchedKeys.every(v => !v);

                return (
                  <div key={group.label}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-sm font-semibold flex items-center gap-2 ${group.color}`}>
                        {gi === 0
                          ? <Car className="h-4 w-4" />
                          : <ShieldCheck className="h-4 w-4" />
                        }
                        {group.label}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleGroup(allKeys as string[], true)}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Todos
                        </button>
                        <span className="text-muted-foreground text-[11px]">·</span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(allKeys as string[], false)}
                          className="text-[11px] font-medium text-muted-foreground hover:underline"
                        >
                          Nenhum
                        </button>
                      </div>
                    </div>

                    <div className={`rounded-xl border ${group.border} ${group.bg} overflow-hidden`}>
                      {group.items.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                          <FormField
                            key={item.key}
                            control={form.control}
                            name={item.key as BooleanField}
                            render={({ field }) => (
                              <FormItem className={idx > 0 ? "border-t border-border/40" : ""}>
                                <div className="flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium leading-tight">{item.label}</p>
                                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                                    </div>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value as boolean}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                </div>
                              </FormItem>
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            </form>
          </Form>
        </div>

        {/* Footer fixo */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="cargo-form" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : cargo ? "Salvar Alterações" : "Cadastrar Cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
