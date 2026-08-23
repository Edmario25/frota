import React, { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFornecedores } from "@/hooks/useFornecedores";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  obra_id: z.string().min(1, "Selecione uma obra"),
  data_inicio: z.date(),
  tipo_contrato: z.string().optional(),
  valor_contrato: z.number().positive("O valor deve ser maior que zero").optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Obra {
  id: string;
  nome: string;
  cliente_nome: string;
  status: string;
}

interface VinculacaoObraModalProps {
  isOpen: boolean;
  onClose: () => void;
  fornecedorId: string;
  fornecedorNome: string;
  onSuccess?: () => void;
}

const TIPO_CONTRATO_OPTIONS = [
  { value: "fornecimento", label: "Fornecimento" },
  { value: "servico", label: "Serviço" },
  { value: "locacao", label: "Locação" },
  { value: "manutencao", label: "Manutenção" },
  { value: "consultoria", label: "Consultoria" },
  { value: "outro", label: "Outro" },
];

export const VinculacaoObraModal: React.FC<VinculacaoObraModalProps> = ({
  isOpen,
  onClose,
  fornecedorId,
  fornecedorNome,
  onSuccess,
}) => {
  const { linkFornecedorToObra } = useFornecedores();
  const [obras, setObras] = useState<Obra[]>([]);
  const [loadingObras, setLoadingObras] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      obra_id: "",
      data_inicio: new Date(),
      tipo_contrato: "",
      valor_contrato: undefined,
      observacoes: "",
    },
  });

  // Load obras when modal opens
  useEffect(() => {
    if (isOpen) {
      form.reset({
        obra_id: "",
        data_inicio: new Date(),
        tipo_contrato: "",
        valor_contrato: undefined,
        observacoes: "",
      });
      
      const loadObras = async () => {
        setLoadingObras(true);
        try {
          const [{ data, error }, { data: links, error: linksError }] = await Promise.all([
            supabase.from('obras').select('id, nome, cliente_nome, status').neq('status', 'concluida').order('nome'),
            supabase.from('obra_fornecedores').select('obra_id').eq('fornecedor_id', fornecedorId).eq('status', true),
          ]);

          if (error) throw error;
          if (linksError) throw linksError;
          const vinculadas = new Set((links ?? []).map(link => link.obra_id));
          setObras((data || []).filter(obra => !vinculadas.has(obra.id)));
        } catch (error) {
          console.error('Error loading obras:', error);
        } finally {
          setLoadingObras(false);
        }
      };
      
      loadObras();
    }
  }, [isOpen, form, fornecedorId]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await linkFornecedorToObra({
        obra_id: data.obra_id,
        fornecedor_id: fornecedorId,
        data_inicio: format(data.data_inicio, "yyyy-MM-dd"),
        tipo_contrato: data.tipo_contrato,
        valor_contrato: data.valor_contrato,
        observacoes: data.observacoes,
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error linking fornecedor to obra:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular Fornecedor à Obra</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Fornecedor: <strong>{fornecedorNome}</strong>
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="obra_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Obra *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={loadingObras}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingObras ? "Carregando..." : "Selecione a obra"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {obras.map((obra) => (
                        <SelectItem key={obra.id} value={obra.id}>
                          {obra.nome} - {obra.cliente_nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_inicio"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data de Início *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione a data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_contrato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Contrato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIPO_CONTRATO_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor_contrato"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor do Contrato (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre o vínculo..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || loadingObras}>
                {isSubmitting ? "Vinculando..." : "Vincular"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
