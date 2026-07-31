import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { Database } from "@/integrations/supabase/types";
import { useRentalCompanies } from "@/hooks/useRentalCompanies";
import { useState as useStateHook } from "react";
import { supabase } from "@/integrations/supabase/client";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];

const vehicleFormSchema = z.object({
  placa: z.string().min(1, "Placa é obrigatória"),
  modelo: z.string().min(1, "Modelo é obrigatório"),
  marca: z.string().min(1, "Marca é obrigatória"),
  ano: z.number().min(1900, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido"),
  tipo: z.enum(['compacto', 'suv', 'caminhonete', 'sedan']),
  cor: z.string().optional(),
  quilometragem_atual: z.number().min(0, "Quilometragem deve ser positiva").optional(),
  quilometragem_maxima_mensal: z.number().min(1, "Limite mensal deve ser positivo").optional(),
  limite_lavagens_mensal: z.number().min(0).optional(),
  valor_aluguel_mensal: z.number().min(0).optional(),
  status: z.enum(['disponivel', 'em_uso', 'manutencao']).optional(),
  observacoes: z.string().optional(),
  tipo_propriedade: z.enum(['proprio', 'alugado']),
  rental_company_id: z.string().optional(),
  responsavel_id: z.string().optional(),
  obra_id: z.string().optional(),
  traccar_device_id: z.string().optional(), // ID numérico como string para o Input
});

interface VehicleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  onSubmit: (data: VehicleInsert) => Promise<void>;
  employees?: Array<{id: string, nome: string}>;
}

export const VehicleFormModal = ({ open, onOpenChange, vehicle, onSubmit, employees = [] }: VehicleFormModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [obras, setObras] = useState<any[]>([]);
  const { rentalCompanies } = useRentalCompanies();

  const form = useForm<z.infer<typeof vehicleFormSchema>>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: {
      placa: "",
      modelo: "",
      marca: "",
      ano: new Date().getFullYear(),
      tipo: "compacto",
      cor: "",
      quilometragem_atual: 0,
      quilometragem_maxima_mensal: 2000,
      limite_lavagens_mensal: 4,
      valor_aluguel_mensal: 0,
      status: "disponivel",
      observacoes: "",
      tipo_propriedade: "proprio",
      rental_company_id: "",
      responsavel_id: "",
      obra_id: "",
      traccar_device_id: "",
    },
  });

  // Helper functions to map between DB types and form types
  const mapDbTypeToFormType = (dbType: string): "compacto" | "suv" | "caminhonete" | "sedan" => {
    if (dbType === 'leve') return 'compacto';
    return 'compacto'; // default for any other type
  };

  const mapFormTypeToDbType = (formType: string): "leve" | "pesado" => {
    // All new form types map to 'leve' since heavy vehicles are managed separately
    return 'leve';
  };

  // Carregar obras para seleção e vinculação atual do veículo
  useEffect(() => {
    const fetchObrasForSelection = async () => {
      try {
        const { data, error } = await supabase
          .from('obras' as any)
          .select('id, nome, status')
          .order('nome');

        if (error) {
          console.error('Erro ao carregar obras:', error);
        } else {
          setObras(data || []);
        }
        
        // Se estiver editando, buscar a obra vinculada atual
        if (vehicle) {
          const { data: vinculoData } = await supabase
            .from('obra_veiculos')
            .select('obra_id')
            .eq('vehicle_id', vehicle.id)
            .eq('status', true)
            .single();
          
          if (vinculoData?.obra_id) {
            form.setValue('obra_id', vinculoData.obra_id);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar obras:', error);
      }
    };

    if (open) {
      fetchObrasForSelection();
    }
  }, [open, vehicle, form]);

  useEffect(() => {
    if (vehicle) {
      form.reset({
        placa: vehicle.placa,
        modelo: vehicle.modelo,
        marca: vehicle.marca,
        ano: vehicle.ano,
        tipo: mapDbTypeToFormType(vehicle.tipo),
        cor: vehicle.cor || "",
        quilometragem_atual: vehicle.quilometragem_atual,
        quilometragem_maxima_mensal: vehicle.quilometragem_maxima_mensal || 2000,
        limite_lavagens_mensal: (vehicle as any).limite_lavagens_mensal || 4,
        valor_aluguel_mensal: (vehicle as any).valor_aluguel_mensal || 0,
        status: vehicle.status as "disponivel" | "em_uso" | "manutencao",
        observacoes: vehicle.observacoes || "",
        tipo_propriedade: (vehicle.tipo_propriedade as "proprio" | "alugado") || "proprio",
        rental_company_id: vehicle.rental_company_id || "",
        responsavel_id: vehicle.responsavel_id || "",
        obra_id: "",
        traccar_device_id: (vehicle as any).traccar_device_id != null
          ? String((vehicle as any).traccar_device_id)
          : "",
      });
    } else {
      form.reset({
        placa: "",
        modelo: "",
        marca: "",
        ano: new Date().getFullYear(),
        tipo: "compacto",
        cor: "",
        quilometragem_atual: 0,
        quilometragem_maxima_mensal: 2000,
        limite_lavagens_mensal: 4,
        valor_aluguel_mensal: 0,
        status: "disponivel",
        observacoes: "",
        tipo_propriedade: "proprio",
        rental_company_id: "",
        responsavel_id: "",
        obra_id: "",
        traccar_device_id: "",
      });
    }
  }, [vehicle, form]);

  const handleSubmit = async (values: z.infer<typeof vehicleFormSchema>) => {
    setIsSubmitting(true);
    console.log('Dados do formulário de veículo enviados:', values);
    console.log('Obra selecionada para veículo:', values.obra_id);
    
    try {
      // Ensure required fields are present and convert to proper format
      const vehicleData = {
        placa: values.placa!,
        modelo: values.modelo!,
        marca: values.marca!,
        ano: values.ano!,
        tipo: mapFormTypeToDbType(values.tipo!),
        cor: values.cor || null,
        quilometragem_atual: values.quilometragem_atual || 0,
        quilometragem_maxima_mensal: values.quilometragem_maxima_mensal || 2000,
        limite_lavagens_mensal: values.limite_lavagens_mensal || 4,
        valor_aluguel_mensal: values.valor_aluguel_mensal || 0,
        status: values.status || 'disponivel',
        observacoes: values.observacoes || null,
        tipo_propriedade: values.tipo_propriedade!,
        rental_company_id: values.rental_company_id || null,
        responsavel_id: values.responsavel_id === "none" ? null : values.responsavel_id || null,
      };
      
      // Adicionar obra_id e traccar_device_id
      const traccarId = values.traccar_device_id?.trim()
        ? parseInt(values.traccar_device_id, 10)
        : null;
      const submitData = {
        ...vehicleData,
        obra_id: values.obra_id,
        traccar_device_id: isNaN(traccarId as number) ? null : traccarId,
      };
        
      console.log('Dados finais do veículo para envio:', submitData);
      
      await onSubmit(submitData);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error is handled in the hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
          <DialogDescription>
            {vehicle ? "Edite as informações do veículo" : "Cadastre um novo veículo na frota"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="placa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Placa</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC-1234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                       <SelectContent>
                         <SelectItem value="compacto">Compacto</SelectItem>
                         <SelectItem value="suv">SUV</SelectItem>
                         <SelectItem value="caminhonete">Caminhonete</SelectItem>
                         <SelectItem value="sedan">Sedan</SelectItem>
                       </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="marca"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca</FormLabel>
                    <FormControl>
                      <Input placeholder="Toyota" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="modelo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modelo</FormLabel>
                    <FormControl>
                      <Input placeholder="Corolla" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="ano"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor</FormLabel>
                    <FormControl>
                      <Input placeholder="Branco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="quilometragem_atual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quilometragem Atual</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0"
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="quilometragem_maxima_mensal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite Km Mensal</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="2000"
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="disponivel">Disponível</SelectItem>
                        <SelectItem value="em_uso">Em Uso</SelectItem>
                        <SelectItem value="manutencao">Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_propriedade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Propriedade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="proprio">Próprio</SelectItem>
                        <SelectItem value="alugado">Alugado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {form.watch("tipo_propriedade") === "alugado" && (
                <FormField
                  control={form.control}
                  name="rental_company_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Locadora</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a locadora" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rentalCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <FormField
                control={form.control}
                name="responsavel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um responsável" />
                        </SelectTrigger>
                      </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nenhum responsável</SelectItem>
                          {employees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.nome}
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
                 name="obra_id"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Obra (Opcional)</FormLabel>
                     <Select onValueChange={(value) => {
                       console.log('Obra selecionada no formulário de veículo:', value);
                       field.onChange(value);
                     }} value={field.value}>
                       <FormControl>
                         <SelectTrigger>
                           <SelectValue placeholder="Selecione uma obra (opcional)" />
                         </SelectTrigger>
                       </FormControl>
                       <SelectContent>
                         {obras.length === 0 ? (
                           <SelectItem value="no-obras" disabled>Nenhuma obra disponível</SelectItem>
                         ) : (
                           obras.map((obra) => (
                             <SelectItem key={obra.id} value={obra.id}>
                               {obra.nome} - {obra.status}
                             </SelectItem>
                           ))
                         )}
                       </SelectContent>
                     </Select>
                     <FormMessage />
                   </FormItem>
                 )}
               />
             </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="limite_lavagens_mensal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite Lavagens / Mês</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="4" {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="valor_aluguel_mensal" render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Aluguel / Mês (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0,00" {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Traccar GPS */}
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sky-700">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-semibold">Rastreador GPS (Traccar)</span>
              </div>
              <FormField
                control={form.control}
                name="traccar_device_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      ID do Dispositivo Traccar
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: 42  (veja em Configurações → GPS / Traccar)"
                        {...field}
                        className="font-mono"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco se o veículo não possui rastreador.
                    </p>
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
                      placeholder="Observações sobre o veículo..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : vehicle ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};