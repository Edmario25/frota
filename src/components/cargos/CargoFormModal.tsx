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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Shield, User, Wallet } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Cargo = Database['public']['Tables']['cargos']['Row'];
type CargoInsert = Database['public']['Tables']['cargos']['Insert'];

const schema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  descricao: z.string().optional(),
  nivel_hierarquico: z.number().min(1).max(10),
  nivel_acesso: z.enum(["funcionario", "gestor_obra", "gestor_contrato"]),
  acesso_fundo_fixo: z.boolean().default(false),
});

const nivelAcessoConfig = {
  funcionario:      { label: "Funcionário",         icon: User,        color: "bg-emerald-100 text-emerald-700" },
  gestor_obra:      { label: "Gestor de Obras",      icon: Shield,      color: "bg-amber-100 text-amber-700" },
  gestor_contrato:  { label: "Gestor de Contratos",  icon: ShieldCheck, color: "bg-violet-100 text-violet-700" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo?: Cargo;
  onSubmit: (data: CargoInsert) => Promise<void>;
}

export const CargoFormModal = ({ open, onOpenChange, cargo, onSubmit }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: "", descricao: "", nivel_hierarquico: 1, nivel_acesso: "funcionario", acesso_fundo_fixo: false,
    },
  });

  const nivelAcessoAtual = form.watch("nivel_acesso");
  const config = nivelAcessoConfig[nivelAcessoAtual];

  useEffect(() => {
    form.reset(
      cargo
        ? {
            nome: cargo.nome ?? "",
            descricao: cargo.descricao ?? "",
            nivel_hierarquico: cargo.nivel_hierarquico ?? 1,
            nivel_acesso: (cargo.nivel_acesso as any) ?? "funcionario",
            acesso_fundo_fixo: cargo.acesso_fundo_fixo ?? false,
          }
        : { nome: "", descricao: "", nivel_hierarquico: 1, nivel_acesso: "funcionario", acesso_fundo_fixo: false }
    );
  }, [cargo, open]);

  const handleSubmit = async (values: z.infer<typeof schema>) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        nome: values.nome,
        descricao: values.descricao || null,
        nivel_hierarquico: values.nivel_hierarquico,
        nivel_acesso: values.nivel_acesso,
        acesso_fundo_fixo: values.acesso_fundo_fixo,
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
          <DialogTitle>{cargo ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
          <DialogDescription>
            {cargo ? "Edite as informações do cargo" : "Cadastre um novo cargo e defina sua permissão de acesso"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Cargo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Motorista, Supervisor, Gerente..." {...field} />
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
                        type="number" min="1" max="10" placeholder="1"
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
                    <FormLabel>Permissão de Acesso</FormLabel>
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

            {/* Preview da permissão */}
            <div className="rounded-lg bg-muted/50 border border-border/50 p-3 flex items-center gap-2">
              <config.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="text-sm text-muted-foreground flex-1">
                Funcionários com este cargo terão acesso de
              </div>
              <Badge className={`${config.color} border-0 text-xs`}>
                {config.label}
              </Badge>
            </div>

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descreva as responsabilidades deste cargo..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fundo Fixo */}
            <FormField
              control={form.control}
              name="acesso_fundo_fixo"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Wallet className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Acesso ao Fundo Fixo</p>
                        <p className="text-xs text-muted-foreground">Permite lançar despesas no caixa da obra</p>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : cargo ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
