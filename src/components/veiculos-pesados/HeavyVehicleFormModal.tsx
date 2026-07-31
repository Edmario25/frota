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
import { supabase } from "@/integrations/supabase/client";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];

const heavyVehicleFormSchema = z.object({
  placa: z.string().min(1, "Placa é obrigatória"),
  modelo: z.string().min(1, "Modelo é obrigatório"),
  marca: z.string().min(1, "Marca é obrigatória"),
  ano: z.number().min(1900, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido"),
  cor: z.string().optional(),
  tipo_medicao: z.enum(['km', 'horimetro']).default('km'),
  quilometragem_atual: z.number().min(0).optional(),
  quilometragem_maxima_mensal: z.number().min(1).optional(),
  horimetro_atual: z.number().min(0).optional(),
  limite_horimetro_mensal: z.number().min(1).optional(),
  limite_lavagens_mensal: z.number().min(0).optional(),
  valor_aluguel_mensal: z.number().min(0).optional(),
  status: z.enum(['disponivel', 'em_uso', 'manutencao']).optional(),
  observacoes: z.string().optional(),
  tipo_propriedade: z.enum(['proprio', 'alugado']),
  rental_company_id: z.string().optional(),
  responsavel_id: z.string().optional(),
  obra_id: z.string().optional(),
});

interface HeavyVehicleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  onSubmit: (data: VehicleInsert) => Promise<void>;
  employees?: Array<{id: string, nome: string}>;
}

export const HeavyVehicleFormModal = ({ open, onOpenChange, vehicle, onSubmit, employees = [] }: HeavyVehicleFormModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [obras, setObras] = useState<any[]>([]);
  const { rentalCompanies } = useRentalCompanies();

  const form = useForm<z.infer<typeof heavyVehicleFormSchema>>({
    resolver: zodResolver(heavyVehicleFormSchema),
    defaultValues: {
      placa: "",
      modelo: "",
      marca: "",
      ano: new Date().getFullYear(),
      cor: "",
      tipo_medicao: "km" as const,
      quilometragem_atual: 0,
      quilometragem_maxima_mensal: 5000,
      horimetro_atual: 0,
      limite_horimetro_mensal: 250,
      limite_lavagens_mensal: 4,
      valor_aluguel_mensal: 0,
      status: "disponivel",
      observacoes: "",
      tipo_propriedade: "proprio",
      rental_company_id: "",
      responsavel_id: "",
      obra_id: "",
    },
  });

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
        cor: vehicle.cor || "",
        tipo_medicao: ((vehicle as any).tipo_medicao || "km") as "km" | "horimetro",
        quilometragem_atual: vehicle.quilometragem_atual,
        quilometragem_maxima_mensal: vehicle.quilometragem_maxima_mensal || 5000,
        horimetro_atual: (vehicle as any).horimetro_atual || 0,
        limite_horimetro_mensal: (vehicle as any).limite_horimetro_mensal || 250,
        limite_lavagens_mensal: (vehicle as any).limite_lavagens_mensal || 4,
        valor_aluguel_mensal: (vehicle as any).valor_aluguel_mensal || 0,
        status: vehicle.status as "disponivel" | "em_uso" | "manutencao",
        observacoes: vehicle.observacoes || "",
        tipo_propriedade: (vehicle.tipo_propriedade as "proprio" | "alugado") || "proprio",
        rental_company_id: vehicle.rental_company_id || "",
        responsavel_id: vehicle.responsavel_id || "",
        obra_id: "",
      });
    } else {
      form.reset({
        placa: "",
        modelo: "",
        marca: "",
        ano: new Date().getFullYear(),
        cor: "",
        tipo_medicao: "km" as const,
        quilometragem_atual: 0,
        quilometragem_maxima_mensal: 5000,
        horimetro_atual: 0,
        limite_horimetro_mensal: 250,
        limite_lavagens_mensal: 4,
        valor_aluguel_mensal: 0,
        status: "disponivel",
        observacoes: "",
        tipo_propriedade: "proprio",
        rental_company_id: "",
        responsavel_id: "",
        obra_id: "",
      });
    }
  }, [vehicle, form]);

  const handleSubmit = async (values: z.infer<typeof heavyVehicleFormSchema>) => {
    setIsSubmitting(true);
    try {
      // Ensure required fields are present and set tipo as "pesado"
      const vehicleData: any = {
        placa: values.placa!,
        modelo: values.modelo!,
        marca: values.marca!,
        ano: values.ano!,
        tipo: "pesado" as const,
        cor: values.cor || null,
        tipo_medicao: values.tipo_medicao || 'km',
        quilometragem_atual: values.tipo_medicao === 'km' ? (values.quilometragem_atual || 0) : 0,
        quilometragem_maxima_mensal: values.tipo_medicao === 'km' ? (values.quilometragem_maxima_mensal || 5000) : null,
        horimetro_atual: values.tipo_medicao === 'horimetro' ? (values.horimetro_atual || 0) : null,
        limite_horimetro_mensal: values.tipo_medicao === 'horimetro' ? (values.limite_horimetro_mensal || 250) : null,
        limite_lavagens_mensal: values.limite_lavagens_mensal || 4,
        valor_aluguel_mensal: values.valor_aluguel_mensal || 0,
        status: values.status || 'disponivel',
        observacoes: values.observacoes || null,
        tipo_propriedade: values.tipo_propriedade!,
        rental_company_id: values.rental_company_id || null,
        responsavel_id: values.responsavel_id === "none" ? null : values.responsavel_id || null,
        obra_id: values.obra_id || null,
      };
      
      await onSubmit(vehicleData);
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
          <DialogTitle>{vehicle ? "Editar Veículo Pesado" : "Novo Veículo Pesado"}</DialogTitle>
          <DialogDescription>
            {vehicle ? "Edite as informações do veículo pesado" : "Cadastre um novo veículo pesado na frota"}
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
                name="marca"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca</FormLabel>
                    <FormControl>
                      <Input placeholder="Mercedes-Benz" {...field} />
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
                      <Input placeholder="Accelo 815" {...field} />
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
                name="tipo_medicao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Medição</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="km">Quilômetros (KM)</SelectItem>
                        <SelectItem value="horimetro">Horímetro (horas)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("tipo_medicao") === "km" ? (
                <>
                  <FormField
                    control={form.control}
                    name="quilometragem_atual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>KM Atual</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                        <FormLabel>Limite KM / Mês</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="10000" {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="horimetro_atual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horímetro Atual (h)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="0.0" {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="limite_horimetro_mensal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Limite Horas / Mês</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="250" {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
              <FormField
                control={form.control}
                name="limite_lavagens_mensal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite Lavagens / Mês</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="4" {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valor_aluguel_mensal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Aluguel / Mês (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0,00" {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
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
                      placeholder="Observações sobre o veículo pesado..."
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