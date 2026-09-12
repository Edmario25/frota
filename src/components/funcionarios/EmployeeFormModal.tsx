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
import { PhotoUpload } from "@/components/ui/photo-upload";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useCargos } from "@/hooks/useCargos";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useEscalas } from "@/hooks/useEscalas";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Employee    = Database['public']['Tables']['employees']['Row'];
type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];

const schema = z.object({
  nome:                  z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf:                   z.string().min(11, "CPF inválido"),
  email:                 z.string().email("E-mail inválido"),
  telefone:              z.string().optional(),
  cargo_id:              z.string().min(1, "Cargo é obrigatório"),
  departamento_id:       z.string().min(1, "Departamento é obrigatório"),
  data_admissao:         z.string().optional(),
  status:                z.enum(["ativo", "inativo", "ferias", "licenca"]),
  obra_id:               z.string().optional(),
  escala_tipo_id:        z.string().optional(),
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

  const { cargos }       = useCargos();
  const { departamentos } = useDepartamentos();
  const { escalaTipos }  = useEscalas();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "", cpf: "", email: "", telefone: "",
      cargo_id: "", departamento_id: "", data_admissao: "",
      status: "ativo", obra_id: "", escala_tipo_id: "",
    },
  });

  // Carrega obras
  useEffect(() => {
    if (!open) return;
    supabase.from("obras" as any).select("id, nome, status").order("nome")
      .then(({ data }) => setObras(data || []));
  }, [open]);

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
          telefone:             employee.telefone ?? "",
          cargo_id:             employee.cargo_id ?? "",
          departamento_id:      employee.departamento_id ?? "",
          data_admissao:        employee.data_admissao ?? "",
          status:               employee.status as any,
          obra_id:              activeObraId,
          escala_tipo_id:       employee.escala_tipo_id ?? "",
        });
        setPhotoUrl(employee.foto_url ?? "");
      } else {
        form.reset({
          nome: "", cpf: "", email: "", telefone: "",
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
        escala_tipo_id:       values.escala_tipo_id || null,
        foto_url:             photoUrl || null,
      };

      const submitData = { ...base, obra_id: values.obra_id };

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

            {/* E-mail é dado cadastral; login e permissões ficam centralizados. */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Contato profissional
              </p>
              <div className="grid grid-cols-1 gap-3">
                <FormField control={form.control} name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail corporativo</FormLabel>
                      <FormControl>
                        <Input placeholder="joao@empresa.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="mt-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                <ShieldCheck className="h-4 w-4 shrink-0" /> Login, senha, perfis e aplicativos são liberados exclusivamente em Controle de Acesso.
              </p>
              </div>

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

              <p className="mt-2 flex items-center gap-1.5 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Cargo e setor são dados organizacionais. As permissões são atribuídas em Controle de Acesso.
              </p>
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
