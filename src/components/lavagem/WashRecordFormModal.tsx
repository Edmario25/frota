import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FornecedorSelect } from "@/components/ui/FornecedorSelect";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const schema = z.object({
  data_lavagem: z.string().min(1, "Data obrigatória"),
  tipo_lavagem: z.string().min(1, "Tipo obrigatório"),
  responsavel_lavagem: z.string().optional(),
  fornecedor: z.string().optional(),
  valor: z.number().min(0).optional(),
  foto_antes_url: z.string().optional(),
  foto_depois_url: z.string().optional(),
  observacoes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface WashRecordFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  washRecord?: any;
  onSubmit: (data: any) => Promise<void>;
}

export const WashRecordFormModal = ({
  open, onOpenChange, vehicleId, washRecord, onSubmit,
}: WashRecordFormModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      data_lavagem: new Date().toISOString().split("T")[0],
      tipo_lavagem: "simples",
      responsavel_lavagem: "",
      fornecedor: "",
      valor: undefined,
      foto_antes_url: "",
      foto_depois_url: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (washRecord) {
        form.reset({
          data_lavagem: washRecord.data_lavagem || new Date().toISOString().split("T")[0],
          tipo_lavagem: washRecord.tipo_lavagem || "simples",
          responsavel_lavagem: washRecord.responsavel_lavagem || "",
          fornecedor: washRecord.fornecedor || "",
          valor: washRecord.valor ?? undefined,
          foto_antes_url: washRecord.foto_antes_url || "",
          foto_depois_url: washRecord.foto_depois_url || "",
          observacoes: washRecord.observacoes || "",
        });
      } else {
        form.reset({
          data_lavagem: new Date().toISOString().split("T")[0],
          tipo_lavagem: "simples",
          responsavel_lavagem: "",
          fornecedor: "",
          valor: undefined,
          foto_antes_url: "",
          foto_depois_url: "",
          observacoes: "",
        });
      }
    }
  }, [open, washRecord, form]);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        vehicle_id: vehicleId,
        data_lavagem: values.data_lavagem,
        tipo_lavagem: values.tipo_lavagem,
        responsavel_lavagem: values.responsavel_lavagem || null,
        fornecedor: values.fornecedor || null,
        valor: values.valor ?? null,
        foto_antes_url: values.foto_antes_url || null,
        foto_depois_url: values.foto_depois_url || null,
        observacoes: values.observacoes || null,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{washRecord ? "Editar Lavagem" : "Registrar Lavagem"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="data_lavagem" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tipo_lavagem" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="simples">Simples</SelectItem>
                      <SelectItem value="completa">Completa</SelectItem>
                      <SelectItem value="polimento">Polimento</SelectItem>
                      <SelectItem value="higienizacao">Higienização Interna</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fornecedor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor / Lava-jato</FormLabel>
                  <FormControl>
                    <FornecedorSelect
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      tipos={["servicos", "geral"]}
                      placeholder="Selecione o lava-jato"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="valor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" step="0.01" placeholder="0,00"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="responsavel_lavagem" render={({ field }) => (
              <FormItem>
                <FormLabel>Responsável pela solicitação</FormLabel>
                <FormControl><Input placeholder="Nome do responsável" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Fotos antes e depois */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="foto_antes_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Foto Antes</FormLabel>
                  <FormControl>
                    <PhotoUpload
                      label=""
                      value={field.value || ""}
                      onChange={(url) => field.onChange(url || "")}
                      bucketName="wash-photos"
                      vehicleId={vehicleId}
                      accept="image/*"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="foto_depois_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>Foto Depois</FormLabel>
                  <FormControl>
                    <PhotoUpload
                      label=""
                      value={field.value || ""}
                      onChange={(url) => field.onChange(url || "")}
                      bucketName="wash-photos"
                      vehicleId={vehicleId}
                      accept="image/*"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea placeholder="Observações adicionais..." className="resize-none" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : washRecord ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
