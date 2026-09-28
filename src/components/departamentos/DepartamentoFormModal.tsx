import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { T, useI18n } from "@/i18n";
import type { Database } from "@/integrations/supabase/types";

type Departamento = Database['public']['Tables']['departamentos']['Row'];
type DepartamentoInsert = Database['public']['Tables']['departamentos']['Insert'];

const schema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  descricao: z.string().optional(),
  responsavel_id: z.string().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departamento?: Departamento;
  onSubmit: (data: DepartamentoInsert) => Promise<void>;
}

export const DepartamentoFormModal = ({ open, onOpenChange, departamento, onSubmit }: Props) => {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; nome: string }[]>([]);

  // Busca simples de employees — sem a cadeia de hooks pesados
  useEffect(() => {
    if (!open) return;
    supabase
      .from("employees")
      .select("id, nome")
      .eq("status", "ativo")
      .order("nome")
      .then(({ data }) => setEmployees(data || []));
  }, [open]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", descricao: "", responsavel_id: "" },
  });

  useEffect(() => {
    form.reset(
      departamento
        ? {
            nome: departamento.nome ?? "",
            descricao: departamento.descricao ?? "",
            responsavel_id: departamento.responsavel_id ?? "",
          }
        : { nome: "", descricao: "", responsavel_id: "" }
    );
  }, [departamento, open]);

  const handleSubmit = async (values: z.infer<typeof schema>) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        nome: values.nome,
        descricao: values.descricao || null,
        responsavel_id: (values.responsavel_id && values.responsavel_id !== "none")
          ? values.responsavel_id
          : null,
      });
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(departamento ? "Editar Departamento" : "Novo Departamento")}</DialogTitle>
          <DialogDescription>
            {t(departamento ? "Edite as informações do departamento" : "Cadastre um novo departamento")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><T>Nome do Departamento</T></FormLabel>
                  <FormControl>
                    <Input placeholder={t("Ex: Operações, RH, Financeiro...")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><T>Descrição</T></FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("Descrição do departamento...")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responsavel_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><T>Responsável (Opcional)</T></FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("Selecione um responsável")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none"><T>Sem responsável</T></SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                <T>Cancelar</T>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {t(isSubmitting ? "Salvando..." : departamento ? "Salvar" : "Cadastrar")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
