import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, Mail, Phone, Briefcase, Building, User, Shield, 
  Car, HardHat, Clock, AlertTriangle, CheckCircle, MapPin 
} from "lucide-react";
import {
  getEmployeeStatusColor,
  getEmployeeStatusText,
  getVehicleStatusColor,
  getVehicleStatusText,
  getObraStatusGradient,
  getObraStatusText,
  getPropertyTypeText,
} from "@/lib/statusHelpers";
import { supabase } from "@/integrations/supabase/client";
import type { EmployeeWithRelations } from "@/hooks/useEmployees";

type Employee = EmployeeWithRelations;

interface ObraVinculada {
  id: string;
  obra_id: string;
  funcao_obra: string;
  data_entrada: string;
  data_saida: string | null;
  status: boolean;
  obra: {
    id: string;
    nome: string;
    codigo_interno: string | null;
    status: string;
    cliente_nome: string;
    cidade: string | null;
    estado: string | null;
  };
}

interface VeiculoVinculado {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  status: string;
  tipo_propriedade: string | null;
  vinculo_tipo: 'responsavel' | 'obra';
}

interface EscalaInfo {
  tipo: {
    id: string;
    nome: string;
    dias_trabalho: number;
    dias_folga: number;
  } | null;
  proximoPeriodo: {
    id: string;
    data_inicio_trabalho: string;
    data_fim_trabalho: string;
    data_inicio_folga: string;
    data_fim_folga: string;
    status: string;
    conflito_detectado: boolean;
    conflito_autorizado: boolean;
  } | null;
}

interface ViewEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

const getTipoAcessoText = (tipo: string) => {
  switch (tipo) {
    case "gestor_geral":
    case "gestor_contrato":
      return "Gestor de Contratos";
    case "gestor_obra":
      return "Gestor de Obras";
    case "colaborador":
    case "funcionario":
      return "Funcionário";
    default:
      return tipo;
  }
};

export const ViewEmployeeModal = ({
  open, 
  onOpenChange, 
  employee 
}: ViewEmployeeModalProps) => {
  const [obrasVinculadas, setObrasVinculadas] = useState<ObraVinculada[]>([]);
  const [veiculosVinculados, setVeiculosVinculados] = useState<VeiculoVinculado[]>([]);
  const [escalaInfo, setEscalaInfo] = useState<EscalaInfo>({ tipo: null, proximoPeriodo: null });
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const fetchEmployeeDetails = async () => {
      if (!employee || !open) return;
      
      setLoadingData(true);
      try {
        // Fetch obras vinculadas
        const { data: obrasData } = await supabase
          .from('obra_funcionarios')
          .select(`
            id,
            obra_id,
            funcao_obra,
            data_entrada,
            data_saida,
            status,
            obras:obra_id (
              id,
              nome,
              codigo_interno,
              status,
              cliente_nome,
              cidade,
              estado
            )
          `)
          .eq('employee_id', employee.id)
          .order('data_entrada', { ascending: false });

        if (obrasData) {
          setObrasVinculadas(obrasData.map((item: any) => ({
            ...item,
            obra: item.obras
          })));
        }

        // Fetch veículos vinculados (direto como responsável)
        const { data: veiculosDiretos, error: errDiretos } = await supabase
          .from('vehicles')
          .select('id, placa, marca, modelo, ano, status, tipo_propriedade')
          .eq('responsavel_id', employee.id);

        if (errDiretos) console.error('Erro ao buscar veículos diretos:', errDiretos);

        // Fetch veículos vinculados via obra — busca obras do funcionário e seus veículos
        let veiculosViaObra: VeiculoVinculado[] = [];
        const obrasDoFuncionario = obrasData
          ?.filter((o: any) => o.status)
          .map((o: any) => o.obra_id) ?? [];

        if (obrasDoFuncionario.length > 0) {
          const { data: veiculosObra, error: errObra } = await supabase
            .from('obra_veiculos')
            .select(`
              vehicles:vehicle_id (
                id, placa, marca, modelo, ano, status, tipo_propriedade
              )
            `)
            .in('obra_id', obrasDoFuncionario)
            .eq('status', true);

          if (errObra) console.error('Erro ao buscar veículos por obra:', errObra);

          veiculosViaObra = (veiculosObra ?? [])
            .map((item: any) => item.vehicles)
            .filter(Boolean)
            .map((v: any) => ({ ...v, vinculo_tipo: 'obra' as const }));
        }

        // Combinar veículos de ambas as fontes (sem duplicatas)
        const veiculosMap = new Map<string, VeiculoVinculado>();

        veiculosDiretos?.forEach(v => {
          veiculosMap.set(v.id, { ...v, vinculo_tipo: 'responsavel' });
        });

        veiculosViaObra.forEach(v => {
          if (!veiculosMap.has(v.id)) {
            veiculosMap.set(v.id, v);
          }
        });

        setVeiculosVinculados(Array.from(veiculosMap.values()));

        // Fetch escala info
        if (employee.escala_tipo_id) {
          const { data: escalaTipoData } = await supabase
            .from('escala_tipos')
            .select('id, nome, dias_trabalho, dias_folga')
            .eq('id', employee.escala_tipo_id)
            .single();

          // Fetch próximo período de folga
          const today = new Date().toISOString().split('T')[0];
          const { data: periodoData } = await supabase
            .from('escala_periodos')
            .select('*')
            .eq('employee_id', employee.id)
            .gte('data_fim_folga', today)
            .order('data_inicio_trabalho', { ascending: true })
            .limit(1)
            .maybeSingle();

          setEscalaInfo({
            tipo: escalaTipoData,
            proximoPeriodo: periodoData
          });
        } else {
          setEscalaInfo({ tipo: null, proximoPeriodo: null });
        }
      } catch (error) {
        console.error('Erro ao buscar detalhes do funcionário:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchEmployeeDetails();
  }, [employee, open]);

  if (!employee) return null;

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Não informado";
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const obraAtiva = obrasVinculadas.find(o => o.status);
  const diasParaFolga = escalaInfo.proximoPeriodo 
    ? Math.ceil((new Date(escalaInfo.proximoPeriodo.data_inicio_folga).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Funcionário</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Header com Avatar e Info Principal */}
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={employee.foto_url || undefined} />
              <AvatarFallback className="text-lg">
                {getInitials(employee.nome)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{employee.nome}</h2>
              <p className="text-muted-foreground">{employee.email}</p>
              <div className="flex items-center space-x-2 mt-2">
                <Badge className={getEmployeeStatusColor(employee.status)}>
                  {getEmployeeStatusText(employee.status)}
                </Badge>
                <Badge variant="outline" className="flex items-center space-x-1">
                  <Shield className="h-3 w-3" />
                  <span>{getTipoAcessoText(employee.tipo_acesso || 'colaborador')}</span>
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="geral" className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Geral</span>
              </TabsTrigger>
              <TabsTrigger value="veiculo" className="flex items-center gap-1">
                <Car className="h-4 w-4" />
                <span className="hidden sm:inline">Veículo</span>
              </TabsTrigger>
              <TabsTrigger value="obra" className="flex items-center gap-1">
                <HardHat className="h-4 w-4" />
                <span className="hidden sm:inline">Obra</span>
              </TabsTrigger>
              <TabsTrigger value="escala" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Escala</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab Geral */}
            <TabsContent value="geral" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center space-x-2">
                    <User className="h-5 w-5" />
                    <span>Informações Pessoais</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">CPF</label>
                      <p className="text-sm">{employee.cpf}</p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="text-sm">{employee.email}</p>
                      </div>
                    </div>
                    
                    {employee.telefone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                          <p className="text-sm">{employee.telefone}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center space-x-2">
                    <Briefcase className="h-5 w-5" />
                    <span>Informações Profissionais</span>
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cargo</label>
                        <p className="text-sm">{employee.cargos?.nome || "Não informado"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Departamento</label>
                        <p className="text-sm">{employee.departamentos?.nome || "Não informado"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Data de Admissão</label>
                        <p className="text-sm">{formatDate(employee.data_admissao)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Informações do Sistema</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="font-medium text-muted-foreground">Cadastrado em</label>
                    <p>{formatDate(employee.created_at)}</p>
                  </div>
                  <div>
                    <label className="font-medium text-muted-foreground">Última atualização</label>
                    <p>{formatDate(employee.updated_at)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Tab Veículo */}
            <TabsContent value="veiculo" className="mt-4">
              {loadingData ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : veiculosVinculados.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-muted-foreground">
                      {veiculosVinculados.length} veículo{veiculosVinculados.length > 1 ? 's' : ''} vinculado{veiculosVinculados.length > 1 ? 's' : ''}
                    </h4>
                  </div>
                  {veiculosVinculados.map((veiculo) => (
                    <Card key={veiculo.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Car className="h-5 w-5" />
                            {veiculo.placa}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {veiculo.vinculo_tipo === 'responsavel' ? 'Responsável Direto' : 'Via Obra'}
                            </Badge>
                            <Badge className={getVehicleStatusColor(veiculo.status)}>
                              {getVehicleStatusText(veiculo.status)}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Modelo</label>
                            <p>{veiculo.marca} {veiculo.modelo}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Ano</label>
                            <p>{veiculo.ano}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Propriedade</label>
                            <p>{veiculo.tipo_propriedade ? getPropertyTypeText(veiculo.tipo_propriedade) : 'Não informado'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Car className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">Nenhum veículo vinculado a este funcionário</p>
                </div>
              )}
            </TabsContent>

            {/* Tab Obra */}
            <TabsContent value="obra" className="mt-4 space-y-4">
              {loadingData ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : obrasVinculadas.length > 0 ? (
                <>
                  {/* Obra Ativa */}
                  {obraAtiva && (
                    <Card className="border-primary/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <HardHat className="h-5 w-5" />
                            Obra Atual
                          </CardTitle>
                          <Badge className={getObraStatusGradient(obraAtiva.obra.status)}>
                            {getObraStatusText(obraAtiva.obra.status)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <p className="font-semibold text-lg">{obraAtiva.obra.nome}</p>
                            <p className="text-sm text-muted-foreground">{obraAtiva.obra.cliente_nome}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Função na Obra</label>
                              <p>{obraAtiva.funcao_obra}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Data Entrada</label>
                              <p>{formatDate(obraAtiva.data_entrada)}</p>
                            </div>
                            {obraAtiva.obra.cidade && (
                              <div className="col-span-2 flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4" />
                                {obraAtiva.obra.cidade}{obraAtiva.obra.estado && `, ${obraAtiva.obra.estado}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Histórico de Obras */}
                  {obrasVinculadas.filter(o => !o.status).length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-muted-foreground">Histórico de Obras</h4>
                      <div className="space-y-2">
                        {obrasVinculadas.filter(o => !o.status).map((obra) => (
                          <Card key={obra.id} className="bg-muted/30">
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{obra.obra.nome}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {obra.funcao_obra} • {formatDate(obra.data_entrada)} - {formatDate(obra.data_saida)}
                                  </p>
                                </div>
                                <Badge variant="outline">{getObraStatusText(obra.obra.status)}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <HardHat className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">Nenhuma obra vinculada a este funcionário</p>
                </div>
              )}
            </TabsContent>

            {/* Tab Escala */}
            <TabsContent value="escala" className="mt-4 space-y-4">
              {loadingData ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : escalaInfo.tipo ? (
                <>
                  {/* Tipo de Escala */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Escala de Trabalho
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div className="text-center p-4 bg-primary/10 rounded-lg">
                          <p className="text-2xl font-bold text-primary">
                            {escalaInfo.tipo.dias_trabalho}x{escalaInfo.tipo.dias_folga}
                          </p>
                          <p className="text-sm text-muted-foreground">{escalaInfo.tipo.nome}</p>
                        </div>
                        <div className="flex-1 space-y-1">
                          <p><span className="font-medium">{escalaInfo.tipo.dias_trabalho}</span> dias de trabalho</p>
                          <p><span className="font-medium">{escalaInfo.tipo.dias_folga}</span> dias de folga</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Próximo Período */}
                  {escalaInfo.proximoPeriodo ? (
                    <Card className={escalaInfo.proximoPeriodo.conflito_detectado && !escalaInfo.proximoPeriodo.conflito_autorizado ? 'border-destructive/50' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Próximo Período
                          </CardTitle>
                          {escalaInfo.proximoPeriodo.conflito_detectado && (
                            escalaInfo.proximoPeriodo.conflito_autorizado ? (
                              <Badge className="gradient-success border-0 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Autorizado
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Conflito
                              </Badge>
                            )
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Trabalho</label>
                            <p className="text-sm">
                              {formatDate(escalaInfo.proximoPeriodo.data_inicio_trabalho)} - {formatDate(escalaInfo.proximoPeriodo.data_fim_trabalho)}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Folga</label>
                            <p className="text-sm">
                              {formatDate(escalaInfo.proximoPeriodo.data_inicio_folga)} - {formatDate(escalaInfo.proximoPeriodo.data_fim_folga)}
                            </p>
                          </div>
                        </div>

                        {diasParaFolga !== null && diasParaFolga > 0 && (
                          <div className="mt-4 p-3 bg-muted rounded-lg text-center">
                            <p className="text-sm text-muted-foreground">Previsão para entrar de folga</p>
                            <p className="text-xl font-bold text-primary">
                              {diasParaFolga === 1 ? 'Amanhã' : `${diasParaFolga} dias`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(escalaInfo.proximoPeriodo.data_inicio_folga)}
                            </p>
                          </div>
                        )}

                        {diasParaFolga !== null && diasParaFolga <= 0 && (
                          <div className="mt-4 p-3 bg-primary/10 rounded-lg text-center">
                            <p className="text-sm text-muted-foreground">Status Atual</p>
                            <p className="text-xl font-bold text-primary">Em Folga</p>
                            <p className="text-sm text-muted-foreground">
                              Retorno em {formatDate(escalaInfo.proximoPeriodo.data_fim_folga)}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p>Nenhum período de escala agendado</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">Nenhuma escala vinculada a este funcionário</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
