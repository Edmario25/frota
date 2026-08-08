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
import { Badge } from "@/components/ui/badge";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { ShieldCheck, Shield, User, Info, KeyRound, ChevronDown, ChevronUp, Smartphone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useCargos } from "@/hooks/useCargos";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useEscalas } from "@/hooks/useEscalas";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Employee    = Database['public']['Tables']['employees']['Row'];
type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];

const nivelAcessoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  funcionario:     { label: "Funcionário",        color: "bg-emerald-100 text-emerald-700", icon: User },
  gestor_obra:     { label: "Gestor de Obras",     color: "bg-amber-100 text-amber-700",    icon: Shield },
  gestor_contrato: { label: "Gestor de Contratos", color: "bg-violet-100 text-violet-700",  icon: ShieldCheck },
};

const schema = z.object({
  nome:                  z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf:                   z.string().min(11, "CPF inválido"),
  email:                 z.string().email("E-mail inválido"),
  senha:                 z.string().min(6, "Mínimo 6 caracteres").or(z.literal("")),
  telefone:              z.string().optional(),
  cargo_id:              z.string().min(1, "Cargo é obrigatório"),
  departamento_id:       z.string().min(1, "Departamento é obrigatório"),
  data_admissao:         z.string().optional(),
  status:                z.enum(["ativo", "inativo", "ferias", "licenca"]),
  obra_id:               z.string().optional(),
  escala_tipo_id:        z.string().optional(),
  acesso_app_motorista:  z.boolean().default(false),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
  onSubmit: (data: EmployeeInsert) => Promise<void>;
}

export const EmployeeFormModal = ({ open, onOpenChange, employee, onSubmit }: Props) => {
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [photoUrl, setPhotoUrl]             = useState("");
  const [obras, setObras]                   = useState<any[]>([]);
  const [cargoAcesso, setCargoAcesso]       = useState<string | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError]   = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const { toast } = useToast();

  const { cargos }       = useCargos();
  const { departamentos } = useDepartamentos();
  const { escalaTipos }  = useEscalas();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "", cpf: "", email: "", senha: "", telefone: "",
      cargo_id: "", departamento_id: "", data_admissao: "",
      status: "ativo", obra_id: "", escala_tipo_id: "",
      acesso_app_motorista: false,
    },
  });

  const selectedCargoId = form.watch("cargo_id");

  // Quando cargo muda, busca o nivel_acesso dele
  useEffect(() => {
    if (!selectedCargoId) { setCargoAcesso(null); return; }
    const cargo = cargos.find((c) => c.id === selectedCargoId);
    setCargoAcesso(cargo?.nivel_acesso ?? null);
  }, [selectedCargoId, cargos]);

  // Carrega obras
  useEffect(() => {
    if (!open) return;
    supabase.from("obras" as any).select("id, nome, status").order("nome")
      .then(({ data }) => setObras(data || []));
  }, [open]);

  // Reseta campos de senha ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setShowPasswordSection(false);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
    }
  }, [open]);

  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem");
      return;
    }
    if (!employee?.user_id) {
      setPasswordError("Funcionário sem conta de acesso vinculada");
      return;
    }
    setIsChangingPassword(true);
    try {
      const { data, error } = await supabase.rpc('update_user_password' as any, {
        p_user_id: employee.user_id,
        p_new_password: newPassword,
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || "Erro ao alterar senha");
      toast({ title: "Senha alterada com sucesso" });
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    } catch (err: any) {
      setPasswordError(err.message || "Erro ao alterar senha");
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Preenche form ao editar
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      if (employee) {
        let activeObraId = "";
        const { data } = await supabase
          .from("obra_funcionarios")
          .select("obra_id")
          .eq("employee_id", employee.id)
          .eq("status", true)
          .maybeSingle();
        if (data) activeObraId = data.obra_id;

        form.reset({
          nome:                 employee.nome ?? "",
          cpf:                  employee.cpf ?? "",
          email:                employee.email ?? "",
          senha:                "",
          telefone:             employee.telefone ?? "",
          cargo_id:             employee.cargo_id ?? "",
          departamento_id:      employee.departamento_id ?? "",
          data_admissao:        employee.data_admissao ?? "",
          status:               employee.status as any,
          obra_id:              activeObraId,
          escala_tipo_id:       employee.escala_tipo_id ?? "",
          acesso_app_motorista: employee.acesso_app_motorista ?? false,
        });
        setPhotoUrl(employee.foto_url ?? "");
      } else {
        form.reset({
          nome: "", cpf: "", email: "", senha: "", telefone: "",
          cargo_id: "", departamento_id: "", data_admissao: "",
          status: "ativo", obra_id: "", escala_tipo_id: "",
        });
        setPhotoUrl("");
      }
    };
    load();
  }, [employee, open]);

  const handleSubmit = async (values: z.infer<typeof schema>) => {
    setIsSubmitting(true);
    try {
      const base: EmployeeInsert = {
        nome:                 values.nome,
        cpf:                  values.cpf,
        email:                values.email,
        telefone:             values.telefone || null,
        cargo_id:             values.cargo_id,
        departamento_id:      values.departamento_id,
        data_admissao:        values.data_admissao || null,
        status:               values.status,
        tipo_acesso:          cargoAcesso || "colaborador",
        escala_tipo_id:       values.escala_tipo_id || null,
        foto_url:             photoUrl || null,
        acesso_app_motorista: values.acesso_app_motorista ?? false,
      };

      const submitData = employee
        ? { ...base, obra_id: values.obra_id }
        : { ...base, senha: values.senha, obra_id: values.obra_id };

      await onSubmit(submitData);
      onOpenChange(false);
      form.reset();
      setPhotoUrl("");
    } catch {
      // erro tratado no hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEdit = !!employee;
  const acessoCfg = cargoAcesso ? nivelAcessoConfig[cargoAcesso] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Edite as informações do funcionário" : "Preencha os dados para cadastrar um novo funcionário"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

            {/* Seção: Dados Pessoais */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Dados Pessoais
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl><Input placeholder="João da Silva" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="data_admissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Admissão <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Seção: Acesso ao Sistema */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Acesso ao Sistema
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail de Login</FormLabel>
                      <FormControl>
                        <Input placeholder="joao@empresa.com" type="email"
                          disabled={isEdit} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isEdit && (
                  <FormField control={form.control} name="senha"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha de Acesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Mínimo 6 caracteres" type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* Acesso ao App do Motorista */}
            <FormField
              control={form.control}
              name="acesso_app_motorista"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="acesso_app_motorista"
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="flex-1">
                      <label
                        htmlFor="acesso_app_motorista"
                        className="text-sm font-semibold cursor-pointer flex items-center gap-2"
                      >
                        <Smartphone className="h-4 w-4 text-blue-600" />
                        Acesso ao App do Motorista
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Permite que este funcionário acesse o app mobile para lançar abastecimentos,
                        manutenções, checklists e consultar a escala de trabalho.
                      </p>
                    </div>
                  </div>
                </FormItem>
              )}
            />

            {/* Seção: Alterar Senha (somente edição) */}
            {isEdit && (
              <div>
                <button
                  type="button"
                  onClick={() => { setShowPasswordSection(v => !v); setPasswordError(""); }}
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Alterar Senha de Login
                  {showPasswordSection ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showPasswordSection && (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                    {!employee?.user_id && (
                      <p className="text-xs text-amber-600">Este funcionário não possui conta de acesso vinculada.</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Nova Senha</label>
                        <Input
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          disabled={!employee?.user_id || isChangingPassword}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Confirmar Nova Senha</label>
                        <Input
                          type="password"
                          placeholder="Repita a nova senha"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          disabled={!employee?.user_id || isChangingPassword}
                        />
                      </div>
                    </div>
                    {passwordError && (
                      <p className="text-xs text-destructive">{passwordError}</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={!employee?.user_id || isChangingPassword || !newPassword}
                    >
                      {isChangingPassword ? "Alterando..." : "Confirmar Nova Senha"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Seção: Cargo e Departamento */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Cargo e Departamento
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="cargo_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {cargos.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="departamento_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o departamento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departamentos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Hint de permissão derivada do cargo */}
              {acessoCfg ? (
                <div className="mt-2 rounded-lg bg-muted/50 border border-border/50 p-2.5 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground flex-1">
                    Permissão definida pelo cargo selecionado:
                  </span>
                  <Badge className={`${acessoCfg.color} border-0 text-xs`}>
                    <acessoCfg.icon className="h-3 w-3 mr-1" />
                    {acessoCfg.label}
                  </Badge>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  A permissão de acesso é definida automaticamente pelo cargo
                </p>
              )}
            </div>

            {/* Seção: Vínculo e Escala */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Vínculo e Escala
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                          <SelectItem value="ferias">Férias</SelectItem>
                          <SelectItem value="licenca">Licença</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="obra_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Obra <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Vincular a uma obra" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sem obra</SelectItem>
                          {obras.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.nome} — {o.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="escala_tipo_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Escala de Trabalho <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma escala" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sem escala definida</SelectItem>
                          {escalaTipos.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome} ({e.dias_trabalho}x{e.dias_folga})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Foto */}
            <PhotoUpload
              label="Foto do Funcionário"
              value={photoUrl}
              onChange={(url) => setPhotoUrl(url || "")}
              bucketName="employee-photos"
              disabled={isSubmitting}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : isEdit ? "Salvar Alterações" : "Cadastrar Funcionário"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
