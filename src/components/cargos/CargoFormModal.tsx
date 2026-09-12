import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, KeyRound } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Cargo = Database['public']['Tables']['cargos']['Row'];
type CargoInsert = Database['public']['Tables']['cargos']['Insert'];

// Cargo é informação de RH. O que a pessoa pode fazer no sistema é definido
// pelo perfil de acesso (menu Admin → Controle de Acesso), não pelo cargo.
const schema = z.object({
  nome:              z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  descricao:         z.string().optional(),
  nivel_hierarquico: z.number().min(1).max(10),
  nivel_acesso:      z.enum(["funcionario", "gestor_obra", "gestor_contrato"]),
});

type FormValues = z.infer<typeof schema>;

const emptyForm = (): FormValues => ({ nome: "", descricao: "", nivel_hierarquico: 1, nivel_acesso: "funcionario" });

const fromCargo = (c: Cargo): FormValues => ({
  nome:              c.nome ?? "",
  descricao:         c.descricao ?? "",
  nivel_hierarquico: c.nivel_hierarquico ?? 1,
  nivel_acesso:      (c.nivel_acesso as FormValues["nivel_acesso"]) ?? "funcionario",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo?: Cargo;
  onSubmit: (data: CargoInsert) => Promise<void>;
}

export const CargoFormModal = ({ open, onOpenChange, cargo, onSubmit }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    form.reset(cargo ? fromCargo(cargo) : emptyForm());
  }, [cargo, open]);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        nome:              values.nome,
        descricao:         values.descricao || null,
        nivel_hierarquico: values.nivel_hierarquico,
        nivel_acesso:      values.nivel_acesso,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-primary" />
            {cargo ? "Editar Cargo" : "Novo Cargo"}
          </DialogTitle>
          <DialogDescription>Nome, hierarquia e responsabilidades do cargo.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="cargo-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Cargo <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="Ex: Técnico de Segurança do Trabalho..." {...field} /></FormControl>
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
                      <Input type="number" min="1" max="10" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
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
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="funcionario">Funcionário</SelectItem>
                        <SelectItem value="gestor_obra">Gestor de Obras</SelectItem>
                        <SelectItem value="gestor_contrato">Gestor de Contratos</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Sugere o perfil inicial ao cadastrar o funcionário.</FormDescription>
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
                  <FormControl><Textarea placeholder="Descreva as responsabilidades deste cargo..." rows={3} {...field} /></FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <KeyRound className="h-4 w-4 shrink-0 text-primary" />
              <p>
                O cargo não define o que a pessoa pode fazer no sistema. Os acessos são dados por perfil em
                <b className="text-foreground"> Admin → Controle de Acesso</b>.
              </p>
            </div>
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
          <Button type="submit" form="cargo-form" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : cargo ? "Salvar Alterações" : "Cadastrar Cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
