import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowUpCircle, Receipt, FileText } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { FundoFixoLancamento } from "@/hooks/useFundoFixo";

const categorias = [
  { value: "alimentacao",  label: "Alimentação" },
  { value: "transporte",   label: "Transporte" },
  { value: "material",     label: "Material" },
  { value: "equipamento",  label: "Equipamento" },
  { value: "hospedagem",   label: "Hospedagem" },
  { value: "servico",      label: "Serviço" },
  { value: "outros",       label: "Outros" },
];

const schema = z.object({
  tipo:            z.enum(["entrada", "saida"]),
  descricao:       z.string().min(3, "Descrição obrigatória"),
  valor:           z.number({ invalid_type_error: "Informe o valor" }).positive("Valor deve ser positivo"),
  categoria:       z.string().min(1, "Categoria obrigatória"),
  data_lancamento: z.string().min(1, "Data obrigatória"),
  recibo_url:      z.string().optional(),
  nf_url:          z.string().optional(),
  observacoes:     z.string().optional(),
  fornecedor:      z.string().optional(),
  fornecedor_documento: z.string().optional(),
  numero_documento: z.string().optional(),
  forma_pagamento: z.string().min(1, "Forma de pagamento obrigatória"),
  frente_servico:  z.string().optional(),
  favorecido:      z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundoId: string;
  /** Se não permitido cadastrar 'entrada' (funcionário common) */
  apenasGestores?: boolean;
  lancamento?: FundoFixoLancamento | null;
  onSubmit: (data: any) => Promise<void>;
  comprovanteObrigatorioAcima?: number;
}

export const FundoFixoLancamentoModal = ({
  open, onOpenChange, fundoId, apenasGestores = false, lancamento, onSubmit, comprovanteObrigatorioAcima = 0,
}: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: "saida",
      descricao: "",
      valor: undefined as any,
      categoria: "outros",
      data_lancamento: new Date().toISOString().split("T")[0],
      recibo_url: "",
      nf_url: "",
      observacoes: "",
      fornecedor: "", fornecedor_documento: "", numero_documento: "",
      forma_pagamento: "dinheiro", frente_servico: "", favorecido: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (lancamento) {
        form.reset({
          tipo:            lancamento.tipo as "entrada" | "saida",
          descricao:       lancamento.descricao,
          valor:           lancamento.valor,
          categoria:       lancamento.categoria ?? "outros",
          data_lancamento: lancamento.data_lancamento,
          recibo_url:      lancamento.recibo_url ?? "",
          nf_url:          lancamento.nf_url ?? "",
          observacoes:     lancamento.observacoes ?? "",
          fornecedor:      (lancamento as any).fornecedor ?? "",
          fornecedor_documento: (lancamento as any).fornecedor_documento ?? "",
          numero_documento: (lancamento as any).numero_documento ?? "",
          forma_pagamento: (lancamento as any).forma_pagamento ?? "dinheiro",
          frente_servico:  (lancamento as any).frente_servico ?? "",
          favorecido:      (lancamento as any).favorecido ?? "",
        });
      } else {
        form.reset({
          tipo: "saida",
          descricao: "",
          valor: undefined as any,
          categoria: "outros",
          data_lancamento: new Date().toISOString().split("T")[0],
          recibo_url: "",
          nf_url: "",
          observacoes: "",
          fornecedor: "", fornecedor_documento: "", numero_documento: "",
          forma_pagamento: "dinheiro", frente_servico: "", favorecido: "",
        });
      }
    }
  }, [open, lancamento]);

  const tipoAtual = form.watch("tipo");

  const handleSubmit = async (values: FormValues) => {
    if (values.tipo === "saida" && values.valor >= comprovanteObrigatorioAcima && !values.recibo_url && !values.nf_url) {
      form.setError("recibo_url", { message: "Anexe um recibo ou nota fiscal para esta despesa" });
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        fundo_fixo_id:   fundoId,
        tipo:            values.tipo,
        descricao:       values.descricao,
        valor:           values.valor,
        categoria:       values.categoria,
        data_lancamento: values.data_lancamento,
        recibo_url:      values.recibo_url || null,
        nf_url:          values.nf_url || null,
        observacoes:     values.observacoes || null,
        fornecedor:      values.fornecedor || null,
        fornecedor_documento: values.fornecedor_documento || null,
        numero_documento: values.numero_documento || null,
        forma_pagamento: values.forma_pagamento,
        frente_servico:  values.frente_servico || null,
        favorecido:      values.favorecido || null,
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
          <DialogTitle>{lancamento ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          <DialogDescription>
            Registre uma entrada ou saída no fundo fixo. Anexe o recibo ou NF quando disponível.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">

            {/* Tipo: Entrada ou Saída */}
            <FormField control={form.control} name="tipo" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Lançamento</FormLabel>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "saida",   label: "Saída",   icon: ArrowDownCircle, color: "border-red-400 bg-red-50 text-red-700" },
                    { value: "entrada", label: "Entrada",  icon: ArrowUpCircle,   color: "border-green-400 bg-green-50 text-green-700" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={apenasGestores && opt.value === "entrada"}
                      onClick={() => field.onChange(opt.value)}
                      className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 px-4 text-sm font-semibold transition-all
                        ${field.value === opt.value
                          ? opt.color + " border-2"
                          : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"}
                        ${apenasGestores && opt.value === "entrada" ? "opacity-40 cursor-not-allowed" : ""}
                      `}
                    >
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />

            {/* Indicador visual do tipo */}
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
              ${tipoAtual === "saida" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {tipoAtual === "saida"
                ? <><ArrowDownCircle className="h-4 w-4" />Despesa / Retirada do caixa</>
                : <><ArrowUpCircle className="h-4 w-4" />Reposição / Entrada no caixa</>
              }
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Data */}
              <FormField control={form.control} name="data_lancamento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Valor */}
              <FormField control={form.control} name="valor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0,00"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Descrição */}
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl><Input placeholder="Ex: Almoço equipe, Combustível gerador, Material..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Categoria */}
            <FormField control={form.control} name="categoria" render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categorias.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fornecedor" render={({ field }) => (
                <FormItem><FormLabel>Fornecedor</FormLabel><FormControl><Input placeholder="Nome ou razão social" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="fornecedor_documento" render={({ field }) => (
                <FormItem><FormLabel>CPF/CNPJ</FormLabel><FormControl><Input placeholder="Documento" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="numero_documento" render={({ field }) => (
                <FormItem><FormLabel>Nº nota/recibo</FormLabel><FormControl><Input placeholder="Número" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="forma_pagamento" render={({ field }) => (
                <FormItem><FormLabel>Forma de pagamento</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{["dinheiro","pix","cartao","transferencia"].map(v => <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="frente_servico" render={({ field }) => (
                <FormItem><FormLabel>Frente de serviço</FormLabel><FormControl><Input placeholder="Local de aplicação" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="favorecido" render={({ field }) => (
                <FormItem><FormLabel>Favorecido</FormLabel><FormControl><Input placeholder="Quem recebeu" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            {/* Recibo / Comprovante */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Recibo / Comprovante</span>
                <Badge variant="outline" className="text-xs">obrigatório conforme limite</Badge>
              </div>
              <FormField control={form.control} name="recibo_url" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <PhotoUpload
                      label="Foto do recibo"
                      value={field.value || undefined}
                      onChange={(url) => field.onChange(url ?? "")}
                      bucketName="fundo-fixo-recibos"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* NF */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Nota Fiscal (NF)</span>
                <Badge variant="outline" className="text-xs">opcional</Badge>
              </div>
              <FormField control={form.control} name="nf_url" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <PhotoUpload
                      label="Foto da NF"
                      value={field.value || undefined}
                      onChange={(url) => field.onChange(url ?? "")}
                      bucketName="fundo-fixo-recibos"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Observações */}
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observações <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                <FormControl>
                  <Textarea placeholder="Detalhes adicionais..." className="resize-none" rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : lancamento ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
