import { useI18n } from "@/i18n";
import { siteStatusLabel } from "@/i18n/siteStatus";
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
import { useFornecedores } from "@/hooks/useFornecedores";
import { useState as useStateHook } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  fornecedor_id: z.string().optional(),
  numero_contrato_locacao: z.string().optional(),
  data_inicio_locacao: z.string().optional(),
  data_fim_locacao: z.string().optional(),
  franquia_km_mensal: z.number().min(0).optional(),
  valor_km_excedente: z.number().min(0).optional(),
  responsavel_id: z.string().optional(),
  obra_id: z.string().min(1, "Selecione a obra responsável pelo veículo"),
  tipo_uso: z.enum(['compartilhado', 'dedicado']),
  setor_id: z.string().optional(),
  traccar_device_id: z.string().optional(), // ID numérico como string para o Input
});

interface VehicleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle;
  /** Devolve o id do veículo salvo, que o plano de manutenção precisa para se aplicar. */
  onSubmit: (data: VehicleInsert) => Promise<string | void>;
  employees?: Array<{id: string, nome: string}>;
}

export const VehicleFormModal = ({ open, onOpenChange, vehicle, onSubmit, employees = [] }: VehicleFormModalProps) => {
  const { t } = useI18n();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [obras, setObras] = useState<any[]>([]);
  // Plano de manutenção: vive fora do formulário porque não é coluna de vehicles,
  // é um vínculo com linha de base própria (a medição do veículo no momento).
  const [planos, setPlanos] = useState<Array<{ id: string; nome: string }>>([]);
  const [planoId, setPlanoId] = useState<string>("none");
  const [planoOriginal, setPlanoOriginal] = useState<string>("none");
  const [setores, setSetores] = useState<any[]>([]);
  const { fornecedores } = useFornecedores();

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
      fornecedor_id: "",
      numero_contrato_locacao: "",
      data_inicio_locacao: "",
      data_fim_locacao: "",
      franquia_km_mensal: 0,
      valor_km_excedente: 0,
      responsavel_id: "",
      obra_id: "",
      tipo_uso: "compartilhado",
      setor_id: "",
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

  // Planos ativos e o plano já aplicado a este veículo.
  useEffect(() => {
    if (!open) return;
    const carregarPlanos = async () => {
      const { data: lista } = await (supabase as any)
        .from("manutencao_planos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      setPlanos((lista as any[]) ?? []);

      if (vehicle?.id) {
        const { data: aplicado } = await (supabase as any)
          .from("manutencao_plano_veiculos")
          .select("plano_id")
          .eq("vehicle_id", vehicle.id)
          .maybeSingle();
        const atual = (aplicado as any)?.plano_id ?? "none";
        setPlanoId(atual);
        setPlanoOriginal(atual);
      } else {
        setPlanoId("none");
        setPlanoOriginal("none");
      }
    };
    void carregarPlanos();
  }, [open, vehicle?.id]);

  /**
   * Aplica (ou troca) o plano depois que o veículo foi salvo — a linha de base
   * vem da medição recém-gravada, e não da que estava na tela ao abrir.
   */
  const sincronizarPlano = async (vehicleId: string) => {
    if (planoId === planoOriginal) return;

    if (planoOriginal !== "none") {
      await (supabase as any)
        .from("manutencao_plano_veiculos")
        .delete()
        .eq("vehicle_id", vehicleId)
        .eq("plano_id", planoOriginal);
    }

    if (planoId !== "none") {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("manutencao_plano_veiculos")
        .insert({ plano_id: planoId, vehicle_id: vehicleId, aplicado_por: user?.user?.id });
      if (error) {
        toast({
          title: "Veículo salvo, plano não aplicado",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }

    toast({
      title: planoId === "none" ? "Plano removido" : "Plano aplicado",
      description: planoId === "none"
        ? "O veículo volta ao intervalo único das Configurações."
        : "Os vencimentos passam a contar da medição atual deste veículo.",
    });
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
        const { data: setoresData, error: setoresError } = await (supabase as any)
          .from('departamento_setores').select('id, nome, departamento_id, departamentos(nome)').eq('ativo', true).order('nome');
        if (setoresError) console.error('Erro ao carregar setores:', setoresError);
        else setSetores(setoresData || []);
        
        // Se estiver editando, buscar a obra vinculada atual
        if (vehicle) {
          const { data: vinculosData } = await supabase
            .from('obra_veiculos')
            .select('obra_id')
            .eq('vehicle_id', vehicle.id)
            .eq('status', true)
            .limit(1);
          
          if (vinculosData?.[0]?.obra_id) {
            form.setValue('obra_id', vinculosData[0].obra_id);
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
        fornecedor_id: (vehicle as any).fornecedor_id || "",
        numero_contrato_locacao: (vehicle as any).numero_contrato_locacao || "",
        data_inicio_locacao: (vehicle as any).data_inicio_locacao || "",
        data_fim_locacao: (vehicle as any).data_fim_locacao || "",
        franquia_km_mensal: Number((vehicle as any).franquia_km_mensal || vehicle.quilometragem_maxima_mensal || 0),
        valor_km_excedente: Number((vehicle as any).valor_km_excedente || 0),
        responsavel_id: vehicle.responsavel_id || "",
        obra_id: "",
        tipo_uso: ((vehicle as any).tipo_uso || "compartilhado") as "compartilhado" | "dedicado",
        setor_id: (vehicle as any).setor_id || "",
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
        fornecedor_id: "",
        numero_contrato_locacao: "",
        data_inicio_locacao: "",
        data_fim_locacao: "",
        franquia_km_mensal: 0,
        valor_km_excedente: 0,
        responsavel_id: "",
        obra_id: "",
        tipo_uso: "compartilhado",
        setor_id: "",
        traccar_device_id: "",
      });
    }
  }, [vehicle, form]);

  const handleSubmit = async (values: z.infer<typeof vehicleFormSchema>) => {
    if (values.tipo_propriedade === "alugado" && !values.fornecedor_id) {
      form.setError("fornecedor_id", { message: "Selecione o fornecedor responsável pela locação" });
      return;
    }
    if (values.tipo_uso === "compartilhado" && (!values.setor_id || values.setor_id === "none")) {
      form.setError("setor_id", { message: "Selecione o setor que utilizará este veículo compartilhado" });
      return;
    }
    if ((values.tipo_uso === "dedicado" || values.status === "em_uso") && !values.responsavel_id) {
      form.setError("responsavel_id", { message: "Informe o condutor responsável antes de liberar o veículo" });
      return;
    }
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
        // Em locação, a franquia contratual é a única fonte do limite mensal.
        quilometragem_maxima_mensal: values.tipo_propriedade === 'alugado'
          ? (values.franquia_km_mensal || 0)
          : (values.quilometragem_maxima_mensal || 2000),
        limite_lavagens_mensal: values.limite_lavagens_mensal || 4,
        valor_aluguel_mensal: values.valor_aluguel_mensal || 0,
        status: values.status || 'disponivel',
        observacoes: values.observacoes || null,
        tipo_propriedade: values.tipo_propriedade!,
        fornecedor_id: values.fornecedor_id || null,
        numero_contrato_locacao: values.numero_contrato_locacao?.trim() || null,
        data_inicio_locacao: values.data_inicio_locacao || null,
        data_fim_locacao: values.data_fim_locacao || null,
        franquia_km_mensal: values.franquia_km_mensal || null,
        valor_km_excedente: values.valor_km_excedente || null,
        responsavel_id: values.responsavel_id === "none" ? null : values.responsavel_id || null,
        tipo_uso: values.tipo_uso,
        setor_id: values.setor_id === "none" ? null : values.setor_id || null,
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
      
      const savedId = (await onSubmit(submitData)) || vehicle?.id;
      if (savedId) await sincronizarPlano(savedId);
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
          <DialogTitle>{vehicle ? t("Editar Veículo") : t("Novo Veículo")}</DialogTitle>
          <DialogDescription>
            {vehicle ? t("Edite as informações do veículo") : t("Cadastre um novo veículo na frota")}
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
                    <FormLabel>{t("Placa")}</FormLabel>
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
                    <FormLabel>{t("Tipo")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("Selecione o tipo")} />
                        </SelectTrigger>
                      </FormControl>
                       <SelectContent>
                         <SelectItem value="compacto">{t("Compacto")}</SelectItem>
                         <SelectItem value="suv">SUV</SelectItem>
                         <SelectItem value="caminhonete">{t("Caminhonete")}</SelectItem>
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
                    <FormLabel>{t("Marca")}</FormLabel>
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
                    <FormLabel>{t("Modelo")}</FormLabel>
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
                    <FormLabel>{t("Ano")}</FormLabel>
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
                    <FormLabel>{t("Cor")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Branco")} {...field} />
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
                    <FormLabel>{t("Quilometragem Atual")}</FormLabel>
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
              
              {form.watch("tipo_propriedade") !== "alugado" && <FormField
                control={form.control}
                name="quilometragem_maxima_mensal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Limite Km Mensal")}</FormLabel>
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
              />}
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Status")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("Selecione o status")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="disponivel">{t("Disponível")}</SelectItem>
                        <SelectItem value="em_uso">{t("Em Uso")}</SelectItem>
                        <SelectItem value="manutencao">{t("Manutenção")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Não é coluna de vehicles: o plano é um vínculo, aplicado depois
                  que o veículo foi salvo, com a medição desta tela como base. */}
              <FormItem>
                <FormLabel>{t("Plano de manutenção")}</FormLabel>
                <Select value={planoId} onValueChange={setPlanoId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Selecione o plano")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("Sem plano — intervalo único")}</SelectItem>
                    {planos.map((plano) => (
                      <SelectItem key={plano.id} value={plano.id}>{plano.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {planoId !== planoOriginal && planoOriginal !== "none"
                    ? t("Trocar o plano recomeça a contagem a partir da medição atual.")
                    : t("Os vencimentos contam a partir da quilometragem informada acima.")}
                </p>
              </FormItem>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_propriedade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Tipo de Propriedade")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("Selecione o tipo")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="proprio">{t("Próprio")}</SelectItem>
                        <SelectItem value="alugado">{t("Alugado")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {form.watch("tipo_propriedade") === "alugado" && (
                <FormField
                  control={form.control}
                  name="fornecedor_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Fornecedor / locadora *")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("Selecione entre os fornecedores cadastrados")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fornecedores.filter(f => f.status === "ativo").map((fornecedor) => (
                            <SelectItem key={fornecedor.id} value={fornecedor.id}>
                              {fornecedor.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <FormField control={form.control} name="tipo_uso" render={({ field }) => (
                <FormItem><FormLabel>{t("Forma de utilização")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="compartilhado">{t("Compartilhado pelo setor")}</SelectItem><SelectItem value="dedicado">{t("Uso exclusivo")}</SelectItem></SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )}/>
              {form.watch("tipo_propriedade") !== "alugado" && <FormField
                control={form.control}
                name="obra_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Obra responsável *")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder={t("Selecione a obra")} /></SelectTrigger></FormControl>
                      <SelectContent>{obras.length === 0 ? <SelectItem value="no-obras" disabled>{t("Nenhuma obra disponível")}</SelectItem> : obras.map((obra) => <SelectItem key={obra.id} value={obra.id}>{obra.nome} - {siteStatusLabel(obra.status, t)}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )}
              />}
              {form.watch("tipo_uso") === "compartilhado" && <FormField control={form.control} name="setor_id" render={({ field }) => (
                <FormItem><FormLabel>{t("Setor responsável *")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "none"}><FormControl><SelectTrigger><SelectValue placeholder={t("Selecione o setor")} /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="none">{t("Selecione um setor")}</SelectItem>{setores.map((setor) => <SelectItem key={setor.id} value={setor.id}>{setor.nome}{setor.departamentos?.nome ? ` · ${setor.departamentos.nome}` : ""}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )}/>}
              {(form.watch("tipo_uso") === "dedicado" || form.watch("status") === "em_uso") && <FormField
                control={form.control}
                name="responsavel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Condutor responsável *")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("Selecione um responsável")} />
                        </SelectTrigger>
                      </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t("Nenhum responsável")}</SelectItem>
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
               />}
             </div>

            {form.watch("tipo_uso") === "compartilhado" && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("Veículo compartilhado permanece sob responsabilidade do setor. O condutor será registrado na saída, inspeção ou abastecimento.")}</p>}

            {form.watch("tipo_propriedade") === "alugado" && <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div><p className="font-medium">{t("Condições da locação")}</p><p className="text-xs text-muted-foreground">{t("A mensalidade e o excedente serão apropriados automaticamente no custo da obra vinculada.")}</p></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField control={form.control} name="numero_contrato_locacao" render={({ field }) => <FormItem><FormLabel>{t("Nº do contrato")}</FormLabel><FormControl><Input placeholder={t("Ex.: CT-2026-015")} {...field}/></FormControl><FormMessage/></FormItem>}/>
                <FormField control={form.control} name="data_inicio_locacao" render={({ field }) => <FormItem><FormLabel>{t("Início da locação")}</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>}/>
                <FormField control={form.control} name="data_fim_locacao" render={({ field }) => <FormItem><FormLabel>{t("Término previsto")}</FormLabel><FormControl><Input type="date" {...field}/></FormControl><FormMessage/></FormItem>}/>
                <FormField control={form.control} name="franquia_km_mensal" render={({ field }) => <FormItem><FormLabel>{t("Franquia de KM / mês")}</FormLabel><FormControl><Input type="number" min="0" placeholder={t("Ex.: 3000")} {...field} onChange={e=>field.onChange(Number(e.target.value)||0)}/></FormControl><FormMessage/></FormItem>}/>
                <FormField control={form.control} name="valor_km_excedente" render={({ field }) => <FormItem><FormLabel>{t("Valor por KM excedente (R$)")}</FormLabel><FormControl><Input type="number" min="0" step="0.0001" placeholder="0,00" {...field} onChange={e=>field.onChange(Number(e.target.value)||0)}/></FormControl><FormMessage/></FormItem>}/>
              </div>
            </div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="limite_lavagens_mensal" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Limite Lavagens / Mês")}</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="4" {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="valor_aluguel_mensal" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Valor Aluguel / Mês (R$)")}</FormLabel>
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
                <span className="text-sm font-semibold">{t("Rastreador GPS (Traccar)")}</span>
              </div>
              <FormField
                control={form.control}
                name="traccar_device_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">{t("ID do Dispositivo Traccar")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("Ex: 42  (veja em Configurações → GPS / Traccar)")}
                        {...field}
                        className="font-mono"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t("Deixe em branco se o veículo não possui rastreador.")}</p>
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
                  <FormLabel>{t("Observações")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("Observações sobre o veículo...")}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancelar")}</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("Salvando...") : vehicle ? t("Salvar") : t("Cadastrar")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
