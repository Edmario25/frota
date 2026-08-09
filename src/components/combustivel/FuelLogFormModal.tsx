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
  data_abastecimento: z.string().min(1, "Data obrigatória"),
  litros: z.number().min(0.1, "Litros devem ser maiores que 0"),
  valor_litro: z.number().min(0.01, "Valor por litro obrigatório"),
  tipo_combustivel: z.string().min(1, "Tipo obrigatório"),
  km_no_abastecimento: z.number().min(0).optional(),
  horimetro_no_abastecimento: z.number().min(0).optional(),
  posto_nome: z.string().optional(),
  observacoes: z.string().optional(),
  foto_comprovante_url: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface FuelLogFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  tipoMedicao?: 'km' | 'horimetro';
  fuelLog?: any;
  onSubmit: (data: any) => Promise<void>;
}

export const FuelLogFormModal = ({
  open, onOpenChange, vehicleId, tipoMedicao = 'km', fuelLog, onSubmit,
}: FuelLogFormModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string>("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      data_abastecimento: new Date().toISOString().split("T")[0],
      litros: 0,
      valor_litro: 0,
      tipo_combustivel: "diesel",
      km_no_abastecimento: undefined,
      horimetro_no_abastecimento: undefined,
      posto_nome: "",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (fuelLog) {
        form.reset({
          data_abastecimento: fuelLog.data_abastecimento || new Date().toISOString().split("T")[0],
          litros: fuelLog.litros || 0,
          valor_litro: fuelLog.valor_litro || 0,
          tipo_combustivel: fuelLog.tipo_combustivel || "diesel",
          km_no_abastecimento: fuelLog.km_no_abastecimento ?? undefined,
          horimetro_no_abastecimento: fuelLog.horimetro_no_abastecimento ?? undefined,
          posto_nome: fuelLog.posto_nome || "",
          observacoes: fuelLog.observacoes || "",
        });
        setFotoUrl(fuelLog.foto_comprovante_url || "");
      } else {
        form.reset({
          data_abastecimento: new Date().toISOString().split("T")[0],
          litros: 0,
          valor_litro: 0,
          tipo_combustivel: "diesel",
          km_no_abastecimento: undefined,
          horimetro_no_abastecimento: undefined,
          posto_nome: "",
          observacoes: "",
        });
        setFotoUrl("");
      }
    }
  }, [open, fuelLog, form]);

  const litros = form.watch("litros") || 0;
  const valorLitro = form.watch("valor_litro") || 0;
  const valorTotal = (litros * valorLitro).toFixed(2);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        vehicle_id: vehicleId,
        data_abastecimento: values.data_abastecimento,
        litros: values.litros,
        valor_litro: values.valor_litro,
        valor_total: parseFloat(valorTotal),
        tipo_combustivel: values.tipo_combustivel,
        km_no_abastecimento: tipoMedicao === 'km' ? (values.km_no_abastecimento ?? null) : null,
        horimetro_no_abastecimento: tipoMedicao === 'horimetro' ? (values.horimetro_no_abastecimento ?? null) : null,
        posto_nome: values.posto_nome || null,
        observacoes: values.observacoes || null,
        foto_comprovante_url: fotoUrl || null,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fuelLog ? "Editar Abastecimento" : "Registrar Abastecimento"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="data_abastecimento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="tipo_combustivel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Combustível</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="diesel_s10">Diesel S10</SelectItem>
                      <SelectItem value="gasolina">Gasolina</SelectItem>
                      <SelectItem value="etanol">Etanol</SelectItem>
                      <SelectItem value="gnv">GNV</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="litros" render={({ field }) => (
                <FormItem>
                  <FormLabel>Litros abastecidos</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0,00" {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="valor_litro" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor por litro (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.001" placeholder="0,000" {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Valor total calculado */}
            <div className="rounded-md bg-muted/50 px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Valor Total</span>
              <span className="text-lg font-bold">R$ {valorTotal}</span>
            </div>

            {/* KM ou Horímetro */}
            {tipoMedicao === 'km' ? (
              <FormField control={form.control} name="km_no_abastecimento" render={({ field }) => (
                <FormItem>
                  <FormLabel>KM no abastecimento</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="Ex: 45000"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ) : (
              <FormField control={form.control} name="horimetro_no_abastecimento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Horímetro no abastecimento (h)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="Ex: 1250.5"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="posto_nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Posto / Fornecedor</FormLabel>
                <FormControl>
                  <FornecedorSelect
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    tipos={["combustivel", "geral"]}
                    placeholder="Selecione o posto"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea placeholder="Observações adicionais..." className="resize-none" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <PhotoUpload
              label="Foto do comprovante de abastecimento"
              value={fotoUrl}
              onChange={(url) => setFotoUrl(url || "")}
              bucketName="fuel-photos"
              vehicleId={vehicleId}
              disabled={isSubmitting}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : fuelLog ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
