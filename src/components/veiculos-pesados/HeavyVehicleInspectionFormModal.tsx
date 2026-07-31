import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { PhotoUpload } from "@/components/ui/photo-upload";

import { getChecklistItemColor } from "@/lib/statusHelpers";
import { useHeavyVehicleInspections } from "@/hooks/useHeavyVehicleInspections";

const formSchema = z.object({
  vehicle_id: z.string().min(1, "Selecione um veículo"),
  employee_id: z.string().optional(),
  data_inspecao: z.date(),
  inspetor_nome: z.string().min(1, "Nome do inspetor é obrigatório"),
  inspetor_funcao: z.string().min(1, "Função do inspetor é obrigatória"),
  km_atual: z.number().min(0, "Quilometragem deve ser positiva").optional(),
  observacoes_gerais: z.string().optional(),
  status_geral: z.string().min(1, "Status é obrigatório"),
});

type FormData = z.infer<typeof formSchema>;

interface HeavyVehicleInspectionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspection?: any;
  vehicleId?: string;
}

interface InspectionItem {
  categoria: string;
  item_nome: string;
  status: 'C' | 'NC' | 'NA';
  observacoes?: string;
}

// Definindo os itens baseados nas planilhas
const INSPECTION_CATEGORIES = {
  'MOTOR': [
    'VERIFICAR NÍVEL DE ÓLEO LUBRIFICANTE',
    'VERIFICAR NÍVEL DE FLUIDO DO ARREFECIMENTO',
    'VERIFICAR TENSÃO DA CORREIA, POLIAS E ENGRENAGENS',
    'VERIFICAR INTEGRIDADE DOS SISTEMAS DE ADMISSÃO, INJEÇÃO E ESCAPE',
    'VERIFICAR RUÍDOS ANÔMALOS',
    'VERIFICAR CONDIÇÕES DO MOTOR E FIXAÇÃO NA ESTRUTURA',
    'VERIFICAR FILTRO DE AR, ÓLEO E COMBUSTÍVEL, MANGUEIRAS E ABRAÇADEIRAS',
    'VERIFICAR VAZAMENTOS DE ÓLEO LUBRIFICANTE OU FLUIDOS'
  ],
  'TRANSMISSÃO': [
    'VERIFICAR NÍVEL DE ÓLEO LUBRIFICANTE',
    'VERIFICAR LIMPEZA E RESPIRO DA CAIXA',
    'VERIFICAR FIXAÇÃO DA CAIXA NA ESTRUTURA',
    'VERIFICAR VEDAÇÕES E FILTROS DA CAIXA',
    'VERIFICAR NÍVEL DE ÓLEO DOS EIXOS E CONDIÇÃO DE PUREZA DO ÓLEO',
    'VERIFICAR RUÍDOS, FOLGAS E VAZAMENTOS',
    'VERIFICAR COLUNA DE DIREÇÃO',
    'INSPECIONAR LUBRIFICAÇÃO E ROLAMENTOS DO VOLANTE DE RODA',
    'VERIFICAR CONDIÇÃO DE COIFAS E BARRA DE DIREÇÃO',
    'VERIFICAR VAZAMENTOS DE ÓLEO LUBRIFICANTE OU FLUIDOS'
  ],
  'SUSPENSÃO': [
    'VERIFICAR INTEGRIDADE DE MOLAS (TRAÇOCAS)',
    'VERIFICAR TORQUE DOS PARAFUSOS E ARQUEAMENTO DE MOLA',
    'VERIFICAR CONDIÇÃO DE AMORTECEDORES'
  ],
  'FREIOS': [
    'VERIFICAR NÍVEL DE FLUIDO (SE NECESSÁRIO)',
    'VERIFICAR FUNCIONAMENTO DO ESTACIONAMENTO E PEDAL',
    'VERIFICAR SISTEMA PNEUMÁTICO DO COMPRESSOR E FORÇA'
  ],
  'HIDRÁULICO': [
    'VERIFICAR CONDIÇÃO DE FILTRO (OXIDAÇÃO E COBRE EXPOSTO)',
    'VERIFICAR INTEGRIDADE DOS COMPONENTES HIDRÁULICOS',
    'VERIFICAR CAIXA DE FUSÍVEIS E RELÉS DE CONTATO',
    'INSPECIONAR ESQUEMA ELÉTRICO E BORNES, BATERIA E DISJUNTORES',
    'VERIFICAR E TESTAR CONTATO DE IGNIÇÃO DE PARTIDA E CHAVES',
    'VERIFICAR ALERTAS NO PAINEL DE BORDO DO VEÍCULO',
    'VERIFICAR CONDIÇÃO DE BATERIA, ALTERNADOR E MOTOR DE PARTIDA',
    'VERIFICAR SINALIZAÇÃO, LUZES E ALARMES SONOROS'
  ],
  'CABINE': [
    'VERIFICAR DANOS, AMASSADOS E TRINCAS EM PORTAS, COLUNA E CAPO',
    'VERIFICAR CHAVES, FECHADURAS E DOBRADIÇAS',
    'VERIFICAR CONDIÇÃO DE VIDRO ELÉTRICO, SOM, MOTORES E JOYSTICK',
    'VERIFICAR AR CONDICIONADO E AQUECIMENTO, CABINE E ESPELHOS',
    'VERIFICAR ESTRIBOS, PARALAMAS E PARA-SAROS',
    'VERIFICAR HASTE DOS PEDAIS (EMBREAGEM/ACELERADOR/FREIO)',
    'VERIFICAR LIMPEZA INTERNA DA CABINE',
    'VERIFICAR ESPELHOS DE FARÓIS E LANTERNAS',
    'VERIFICAR AUTENTICIDADE TÉCNICA DO PLANO DE MANUTENÇÃO',
    'VERIFICAR DOCUMENTAÇÃO DO VEÍCULO',
    'VERIFICAR FUNCIONAMENTO DE TACÓGRAFO',
    'VERIFICAR DOCUMENTAÇÃO DOS SISTEMAS DE CONDUÇÃO',
    'VERIFICAR LIMPADOR DO PARA-BRISA E ESGUICHO'
  ],
  'ESTRUTURA': [
    'VERIFICAR VISUALMENTE EVENTO E FUSILARIA DE CHASSIS',
    'VERIFICAR EXISTÊNCIA DE OXIDAÇÃO E FERRUGEM NA ESTRUTURA',
    'VERIFICAR TRAVA DE SEGURANÇA NA FUNÇÃO (ESCAVADEIRA HIDRÁULICA)',
    'VERIFICAR PLACAS DO VEÍCULO',
    'VERIFICAR PONTO DE ANCORAGEM (ESCAVADEIRA HIDRÁULICA)'
  ],
  'IMPLEMENTO': [
    'VERIFICAR CONDIÇÃO DE CONCHA, CHAPAS, CARROCERIAS E FPS',
    'VERIFICAR FOLGAS EM BUCHAS E PINOS',
    'VERIFICAR FUNCIONALIDADES E ACIONAMENTOS DO IMPLEMENTO',
    'TESTAR SENSORES DE CALIBRAÇÃO DE ANTENA (GUINDASTE)',
    'VERIFICAR SENSOR LIMITADOR CAPACIDADE DE CARGA (GUINDASTE)',
    'VERIFICAR CONDIÇÃO DE ÓLEO HIDRÁULICO DO EQUIPAMENTO (GUINDASTE)',
    'VERIFICAR AUTENTICIDADE TÉCNICA DO TESTE DE CARGA (GUINDASTE)',
    'VERIFICAR INTEGRIDADE DOS CABOS, ESTROPOS E LINGAS (GUINDASTE)',
    'VERIFICAR VISIBILIDADE DA TABELA DE CARGA (GUINDASTE)',
    'VERIFICAR A EXISTÊNCIA DE ESCORA DE IMPLEMENTAÇÃO ADEQUADA',
    'VERIFICAR FIXAÇÃO E INTEGRIDADE DE CORDOALHA E GUARDA CORPO',
    'VERIFICAR VAZAMENTOS DE ATIVIDADE (ANTI VIBRA/ÓRGÃO AMBIENTAL)',
    'VERIFICAR IDENTIFICAÇÃO E PLACAS DE IMPLEMENTAÇÃO E FPS',
    'VERIFICAR FUNCIONAMENTO DE VAÇÃO DE PRESSÃO (COMPAC)',
    'VERIFICAR IDENTIFICAÇÃO DE ATIVIDADE (ANTI VIBRA/ÓRGÃO AMBIENTAL)',
    'VERIFICAR FUNÇÃO DE IMPLEMENTAÇÃO (OLEO USADO BIODIESEL E FPS)'
  ],
  'MATERIAL RODANTE': [
    'VERIFICAR CONDIÇÃO, NÍVEL DE DESGASTE E GARANTIA DOS PNEUS DOT',
    'VERIFICAR NÍVEL DE DESGASTE DOS SUBCOMPONENTES DA ESTEIRA',
    'CONFERIR MEDIÇÃO DO MATERIAL DE DESGASTE (ANÁLISE DOS INDICES)'
  ]
};

export const HeavyVehicleInspectionFormModal: React.FC<HeavyVehicleInspectionFormModalProps> = ({
  isOpen,
  onClose,
  inspection,
  vehicleId,
}) => {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { role: userRole } = useUserRole();
  const { employee: currentEmployee } = useCurrentEmployee();
  const { createInspection, createInspectionItem, updateInspection } = useHeavyVehicleInspections();
  
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([]);
  const [checklistPhotos, setChecklistPhotos] = useState<{
    frente: string;
    traseira: string;
    lado_direito: string;
    lado_esquerdo: string;
    painel: string;
  }>({
    frente: '',
    traseira: '',
    lado_direito: '',
    lado_esquerdo: '',
    painel: '',
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicle_id: "",
      employee_id: currentEmployee?.id || "",
      data_inspecao: new Date(),
      inspetor_nome: "",
      inspetor_funcao: "",
      km_atual: undefined,
      observacoes_gerais: "",
      status_geral: "pendente",
    },
  });

  // Filter vehicles based on user role - only show heavy vehicles
  const availableVehicles = React.useMemo(() => {
    const heavyVehicles = vehicles.filter(vehicle => vehicle.tipo === 'pesado');
    
    if (userRole === 'funcionario' && currentEmployee) {
      return heavyVehicles.filter(vehicle => vehicle.responsavel_id === currentEmployee.id);
    }
    return heavyVehicles;
  }, [vehicles, userRole, currentEmployee]);

  useEffect(() => {
    if (inspection) {
      form.reset({
        vehicle_id: inspection.vehicle_id,
        employee_id: inspection.employee_id,
        data_inspecao: new Date(inspection.data_inspecao),
        inspetor_nome: inspection.inspetor_nome,
        inspetor_funcao: inspection.inspetor_funcao,
        km_atual: inspection.km_atual || undefined,
        observacoes_gerais: inspection.observacoes_gerais || "",
        status_geral: inspection.status_geral,
      });
      // Load photos if available
      if (inspection.fotos_checklist) {
        try {
          setChecklistPhotos(JSON.parse(inspection.fotos_checklist));
        } catch (e) {
          console.error("Error parsing fotos_checklist:", e);
        }
      }
    } else {
      form.reset({
        vehicle_id: "",
        employee_id: currentEmployee?.id || "",
        data_inspecao: new Date(),
        inspetor_nome: "",
        inspetor_funcao: "",
        km_atual: undefined,
        observacoes_gerais: "",
        status_geral: "pendente",
      });
      // Initialize inspection items and photos
      const items: InspectionItem[] = [];
      Object.entries(INSPECTION_CATEGORIES).forEach(([categoria, itemList]) => {
        itemList.forEach(item => {
          items.push({
            categoria,
            item_nome: item,
            status: 'NA',
            observacoes: ''
          });
        });
      });
      setInspectionItems(items);
      setChecklistPhotos({
        frente: '',
        traseira: '',
        lado_direito: '',
        lado_esquerdo: '',
        painel: '',
      });
    }
  }, [inspection, form, currentEmployee]);

  const onSubmit = async (data: FormData) => {
    try {
      // Get employee_id from current employee or vehicle responsible
      let employeeId = data.employee_id || currentEmployee?.id;
      
      if (!employeeId) {
        const selectedVehicle = availableVehicles.find(v => v.id === data.vehicle_id);
        if (selectedVehicle?.responsavel_id) {
          employeeId = selectedVehicle.responsavel_id;
        }
      }

      // Fallback for admins without employee record - use first available employee
      if (!employeeId && employees.length > 0) {
        employeeId = employees[0].id;
      }

      if (!employeeId) {
        console.error("Não foi possível identificar o funcionário");
        return;
      }

      const inspectionData = {
        vehicle_id: data.vehicle_id,
        employee_id: employeeId,
        data_inspecao: data.data_inspecao.toISOString(),
        inspetor_nome: data.inspetor_nome,
        inspetor_funcao: data.inspetor_funcao,
        km_atual: data.km_atual || null,
        observacoes_gerais: data.observacoes_gerais || null,
        status_geral: data.status_geral,
        fotos_checklist: Object.values(checklistPhotos).some(url => url) ? JSON.stringify(checklistPhotos) : null,
      };

      let createdInspection;
      if (inspection) {
        createdInspection = await updateInspection(inspection.id, inspectionData);
      } else {
        createdInspection = await createInspection(inspectionData);
        
        // Create inspection items
        for (const item of inspectionItems) {
          if (item.status !== 'NA') { // Only save items that were actually inspected
            await createInspectionItem({
              inspection_id: createdInspection.id,
              categoria: item.categoria,
              item_nome: item.item_nome,
              status: item.status,
              observacoes: item.observacoes || null,
            });
          }
        }
      }
      
      onClose();
      form.reset();
      setInspectionItems([]);
    } catch (error) {
      console.error("Error saving inspection:", error);
    }
  };

  const updateInspectionItem = (index: number, field: keyof InspectionItem, value: any) => {
    setInspectionItems(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {inspection ? "Editar Inspeção" : "Nova Inspeção de Veículo Pesado"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Vehicle Selection */}
              <FormField
                control={form.control}
                name="vehicle_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Veículo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o veículo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableVehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.placa} - {vehicle.marca} {vehicle.modelo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Inspection Date */}
              <FormField
                control={form.control}
                name="data_inspecao"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data da Inspeção</FormLabel>
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

              {/* Inspector Name */}
              <FormField
                control={form.control}
                name="inspetor_nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Inspetor</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo do inspetor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Inspector Function */}
              <FormField
                control={form.control}
                name="inspetor_funcao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função do Inspetor</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Técnico de Segurança, Mecânico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Current Mileage */}
              <FormField
                control={form.control}
                name="km_atual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quilometragem Atual</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Ex: 15000"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status_geral"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status da Inspeção</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="aprovado">Aprovado</SelectItem>
                        <SelectItem value="reprovado">Reprovado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Inspection Items by Category */}
            {!inspection && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Itens de Inspeção por Categoria</h3>
                <Tabs defaultValue={Object.keys(INSPECTION_CATEGORIES)[0]} className="w-full">
                  <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                    {Object.keys(INSPECTION_CATEGORIES).map((categoria) => (
                      <TabsTrigger key={categoria} value={categoria} className="text-xs">
                        {categoria}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {Object.entries(INSPECTION_CATEGORIES).map(([categoria, items]) => (
                    <TabsContent key={categoria} value={categoria} className="space-y-3">
                      <h4 className="font-medium text-sm">{categoria}</h4>
                      <div className="space-y-2">
                        {items.map((itemName, itemIndex) => {
                          const globalIndex = inspectionItems.findIndex(
                            item => item.categoria === categoria && item.item_nome === itemName
                          );
                          const item = inspectionItems[globalIndex];
                          
                          if (!item) return null;

                          return (
                            <div key={`${categoria}-${itemIndex}`} className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <h5 className="font-medium text-sm flex-1">{itemName}</h5>
                                <div className="flex gap-1">
                                  {['C', 'NC', 'NA'].map((status) => (
                                    <Button
                                      key={status}
                                      type="button"
                                      size="sm"
                                      variant={item.status === status ? "default" : "outline"}
                                      className={cn(
                                        "text-xs px-2 py-1",
                                        item.status === status && getChecklistItemColor(status.toLowerCase())
                                      )}
                                      onClick={() => updateInspectionItem(globalIndex, 'status', status)}
                                    >
                                      {status}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                              
                              {item.status !== 'NA' && (
                                <div>
                                  <Input
                                    placeholder="Observações sobre este item"
                                    value={item.observacoes || ''}
                                    onChange={(e) => updateInspectionItem(globalIndex, 'observacoes', e.target.value)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            <Separator />

            {/* General Photos */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Fotos do Checklist</h3>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'frente', label: 'Foto 1: Frente', icon: '🚗' },
                  { key: 'traseira', label: 'Foto 2: Traseira', icon: '🚙' },
                  { key: 'lado_direito', label: 'Foto 3: Lado Direito', icon: '➡️' },
                  { key: 'lado_esquerdo', label: 'Foto 4: Lado Esquerdo', icon: '⬅️' },
                  { key: 'painel', label: 'Foto 5: Painel', icon: '📊' },
                ].map((categoria) => (
                  <div key={categoria.key} className="border-2 border-dashed border-muted rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{categoria.icon}</span>
                      <span className="text-sm font-medium">{categoria.label}</span>
                    </div>
                    <PhotoUpload
                      label=""
                      bucketName="vehicle-photos"
                      value={checklistPhotos[categoria.key as keyof typeof checklistPhotos]}
                      onChange={(url) => {
                        setChecklistPhotos(prev => ({
                          ...prev,
                          [categoria.key]: url
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* General Observations */}
            <FormField
              control={form.control}
              name="observacoes_gerais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações Gerais</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações gerais sobre a inspeção..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                {inspection ? "Atualizar" : "Salvar"} Inspeção
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};