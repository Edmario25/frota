import React, { useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Car, Wrench, Building2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useObras } from "@/hooks/useObras";
import { useRentalCompanies } from "@/hooks/useRentalCompanies";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VehicleResult {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  status: string;
  tipo_propriedade: string | null;
  obra_nome?: string;
  locadora_nome?: string;
}

interface ServiceResult {
  id: string;
  tipo: string;
  descricao: string;
  status: string;
  data_agendada: string;
  data_realizada: string | null;
  vehicle_placa: string;
  vehicle_modelo: string;
}

interface FornecedorResult {
  id: string;
  nome: string;
  tipo_fornecedor: string;
  status: string;
  cidade: string | null;
  obra_nome?: string;
  tipo_contrato?: string;
}

const Consultas = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState("veiculos");

  // Role and obra context
  const { shouldFilterByObra } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  // Veículos filters
  const [vehicleTipoFilter, setVehicleTipoFilter] = useState<string>("all");
  const [vehicleObraFilter, setVehicleObraFilter] = useState<string>("all");
  const [vehicleLocadoraFilter, setVehicleLocadoraFilter] = useState<string>("all");
  const [vehicleResults, setVehicleResults] = useState<VehicleResult[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  // Serviços filters
  const [serviceStatusFilter, setServiceStatusFilter] = useState<string>("all");
  const [serviceDateFrom, setServiceDateFrom] = useState<string>("");
  const [serviceDateTo, setServiceDateTo] = useState<string>("");
  const [serviceResults, setServiceResults] = useState<ServiceResult[]>([]);
  const [serviceLoading, setServiceLoading] = useState(false);

  // Fornecedores filters
  const [fornecedorObraFilter, setFornecedorObraFilter] = useState<string>("all");
  const [fornecedorTipoFilter, setFornecedorTipoFilter] = useState<string>("all");
  const [fornecedorResults, setFornecedorResults] = useState<FornecedorResult[]>([]);
  const [fornecedorLoading, setFornecedorLoading] = useState(false);

  const { obras, loading: loadingObras } = useObras();
  const { rentalCompanies } = useRentalCompanies();

  // Pre-select obra for gestor_obra
  useEffect(() => {
    if (shouldFilterByObra && obraId && !loadingObra) {
      setVehicleObraFilter(obraId);
      setFornecedorObraFilter(obraId);
    }
  }, [shouldFilterByObra, obraId, loadingObra]);

  // Fetch vehicles by obra/locadora
  const searchVehicles = useCallback(async () => {
    setVehicleLoading(true);
    try {
      let query = supabase
        .from("vehicles")
        .select(`
          id,
          placa,
          marca,
          modelo,
          ano,
          status,
          tipo,
          tipo_propriedade,
          rental_company_id,
          rental_companies(nome)
        `)
        .order("placa");

      // Filtrar por tipo de veículo
      if (vehicleTipoFilter !== "all") {
        query = query.eq("tipo", vehicleTipoFilter as "leve" | "pesado");
      }

      if (vehicleLocadoraFilter !== "all") {
        query = query.eq("rental_company_id", vehicleLocadoraFilter);
      }

      const { data: vehicles, error } = await query;
      if (error) throw error;

      let results: VehicleResult[] = [];

      if (vehicleObraFilter !== "all") {
        // Get vehicles linked to specific obra
        const { data: obraVehicles, error: obraError } = await supabase
          .from("obra_veiculos")
          .select("vehicle_id, obras(nome)")
          .eq("obra_id", vehicleObraFilter)
          .eq("status", true);

        if (obraError) throw obraError;

        const vehicleIds = obraVehicles?.map(ov => ov.vehicle_id) || [];
        results = (vehicles || [])
          .filter(v => vehicleIds.includes(v.id))
          .map(v => {
            const obraLink = obraVehicles?.find(ov => ov.vehicle_id === v.id);
            return {
              id: v.id,
              placa: v.placa,
              marca: v.marca,
              modelo: v.modelo,
              ano: v.ano,
              status: v.status,
              tipo_propriedade: v.tipo_propriedade,
              obra_nome: (obraLink?.obras as any)?.nome || "-",
              locadora_nome: (v.rental_companies as any)?.nome || "-",
            };
          });
      } else {
        // Get all vehicles with their obra links
        const { data: allObraLinks, error: allObraError } = await supabase
          .from("obra_veiculos")
          .select("vehicle_id, obras(nome)")
          .eq("status", true);

        if (allObraError) throw allObraError;

        results = (vehicles || []).map(v => {
          const obraLink = allObraLinks?.find(ol => ol.vehicle_id === v.id);
          return {
            id: v.id,
            placa: v.placa,
            marca: v.marca,
            modelo: v.modelo,
            ano: v.ano,
            status: v.status,
            tipo_propriedade: v.tipo_propriedade,
            obra_nome: (obraLink?.obras as any)?.nome || "-",
            locadora_nome: (v.rental_companies as any)?.nome || "-",
          };
        });
      }

      setVehicleResults(results);
    } catch (error) {
      console.error("Erro ao buscar veículos:", error);
    } finally {
      setVehicleLoading(false);
    }
  }, [vehicleTipoFilter, vehicleObraFilter, vehicleLocadoraFilter]);

  // Fetch services by status/dates - filtered by obra for gestor_obra
  const searchServices = useCallback(async () => {
    setServiceLoading(true);
    try {
      // If gestor_obra, first get vehicle IDs from their obra
      let vehicleIdsFromObra: string[] | null = null;
      
      if (shouldFilterByObra && obraId) {
        const { data: obraVehicles, error: obraError } = await supabase
          .from("obra_veiculos")
          .select("vehicle_id")
          .eq("obra_id", obraId)
          .eq("status", true);
        
        if (obraError) throw obraError;
        vehicleIdsFromObra = obraVehicles?.map(ov => ov.vehicle_id) || [];
        
        // If no vehicles in obra, return empty results
        if (vehicleIdsFromObra.length === 0) {
          setServiceResults([]);
          setServiceLoading(false);
          return;
        }
      }

      let query = supabase
        .from("maintenance_records")
        .select(`
          id,
          tipo,
          descricao,
          status,
          data_agendada,
          data_realizada,
          vehicle_id,
          vehicles(placa, modelo)
        `)
        .order("data_agendada", { ascending: false });

      // Filter by vehicles in obra for gestor_obra
      if (vehicleIdsFromObra) {
        query = query.in("vehicle_id", vehicleIdsFromObra);
      }

      if (serviceStatusFilter !== "all") {
        query = query.eq("status", serviceStatusFilter as "agendada" | "em_andamento" | "concluida" | "cancelada");
      }

      if (serviceDateFrom) {
        query = query.gte("data_agendada", serviceDateFrom);
      }

      if (serviceDateTo) {
        query = query.lte("data_agendada", serviceDateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      const results: ServiceResult[] = (data || []).map(s => ({
        id: s.id,
        tipo: s.tipo,
        descricao: s.descricao,
        status: s.status,
        data_agendada: s.data_agendada,
        data_realizada: s.data_realizada,
        vehicle_placa: (s.vehicles as any)?.placa || "-",
        vehicle_modelo: (s.vehicles as any)?.modelo || "-",
      }));

      setServiceResults(results);
    } catch (error) {
      console.error("Erro ao buscar serviços:", error);
    } finally {
      setServiceLoading(false);
    }
  }, [serviceStatusFilter, serviceDateFrom, serviceDateTo, shouldFilterByObra, obraId]);

  // Fetch fornecedores by obra/tipo
  const searchFornecedores = useCallback(async () => {
    setFornecedorLoading(true);
    try {
      if (fornecedorObraFilter !== "all") {
        // Get fornecedores linked to specific obra
        const { data: obraFornecedores, error } = await supabase
          .from("obra_fornecedores")
          .select(`
            id,
            tipo_contrato,
            fornecedores(id, nome, tipo_fornecedor, status, cidade),
            obras(nome)
          `)
          .eq("obra_id", fornecedorObraFilter)
          .eq("status", true);

        if (error) throw error;

        let results: FornecedorResult[] = (obraFornecedores || []).map(of => ({
          id: (of.fornecedores as any)?.id || "",
          nome: (of.fornecedores as any)?.nome || "-",
          tipo_fornecedor: (of.fornecedores as any)?.tipo_fornecedor || "-",
          status: (of.fornecedores as any)?.status || "-",
          cidade: (of.fornecedores as any)?.cidade || null,
          obra_nome: (of.obras as any)?.nome || "-",
          tipo_contrato: of.tipo_contrato || "-",
        }));

        if (fornecedorTipoFilter !== "all") {
          results = results.filter(f => f.tipo_fornecedor === fornecedorTipoFilter);
        }

        setFornecedorResults(results);
      } else {
        // Get all fornecedores
        let query = supabase
          .from("fornecedores")
          .select("*")
          .order("nome");

        if (fornecedorTipoFilter !== "all") {
          query = query.eq("tipo_fornecedor", fornecedorTipoFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Get all obra links
        const { data: allLinks, error: linksError } = await supabase
          .from("obra_fornecedores")
          .select("fornecedor_id, tipo_contrato, obras(nome)")
          .eq("status", true);

        if (linksError) throw linksError;

        const results: FornecedorResult[] = (data || []).map(f => {
          const link = allLinks?.find(l => l.fornecedor_id === f.id);
          return {
            id: f.id,
            nome: f.nome,
            tipo_fornecedor: f.tipo_fornecedor,
            status: f.status,
            cidade: f.cidade,
            obra_nome: (link?.obras as any)?.nome || "-",
            tipo_contrato: link?.tipo_contrato || "-",
          };
        });

        setFornecedorResults(results);
      }
    } catch (error) {
      console.error("Erro ao buscar fornecedores:", error);
    } finally {
      setFornecedorLoading(false);
    }
  }, [fornecedorObraFilter, fornecedorTipoFilter]);

  // Auto-search on filter change
  useEffect(() => {
    if (activeTab === "veiculos") {
      searchVehicles();
    }
  }, [activeTab, searchVehicles]);

  useEffect(() => {
    if (activeTab === "servicos") {
      searchServices();
    }
  }, [activeTab, searchServices]);

  useEffect(() => {
    if (activeTab === "fornecedores") {
      searchFornecedores();
    }
  }, [activeTab, searchFornecedores]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      disponivel: { label: "Disponível", className: "bg-green-100 text-green-800" },
      em_uso: { label: "Em Uso", className: "bg-blue-100 text-blue-800" },
      manutencao: { label: "Manutenção", className: "bg-yellow-100 text-yellow-800" },
      inativo: { label: "Inativo", className: "bg-gray-100 text-gray-800" },
      agendada: { label: "Agendada", className: "bg-blue-100 text-blue-800" },
      em_andamento: { label: "Em Andamento", className: "bg-yellow-100 text-yellow-800" },
      concluida: { label: "Concluída", className: "bg-green-100 text-green-800" },
      cancelada: { label: "Cancelada", className: "bg-red-100 text-red-800" },
      ativo: { label: "Ativo", className: "bg-green-100 text-green-800" },
      bloqueado: { label: "Bloqueado", className: "bg-red-100 text-red-800" },
    };

    const config = statusMap[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const TIPO_FORNECEDOR_LABELS: Record<string, string> = {
    materiais: "Materiais",
    servicos: "Serviços",
    equipamentos: "Equipamentos",
    combustivel: "Combustível",
    pecas: "Peças",
    geral: "Geral",
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            Consultas
          </h1>
          <p className="text-muted-foreground">
            Consulte informações do sistema com filtros avançados
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="veiculos" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Veículos
            </TabsTrigger>
            <TabsTrigger value="servicos" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Serviços
            </TabsTrigger>
            <TabsTrigger value="fornecedores" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Fornecedores
            </TabsTrigger>
          </TabsList>

          {/* Veículos Tab */}
          <TabsContent value="veiculos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5" />
                  Filtros - Veículos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Veículo</Label>
                    <Select value={vehicleTipoFilter} onValueChange={setVehicleTipoFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os tipos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        <SelectItem value="leve">Leve</SelectItem>
                        <SelectItem value="pesado">Pesado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Por Obra</Label>
                    <Select 
                      value={vehicleObraFilter} 
                      onValueChange={setVehicleObraFilter}
                      disabled={shouldFilterByObra}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={shouldFilterByObra ? "Sua obra" : "Todas as obras"} />
                      </SelectTrigger>
                      <SelectContent>
                        {!shouldFilterByObra && (
                          <SelectItem value="all">Todas as obras</SelectItem>
                        )}
                        {obras.map((obra) => (
                          <SelectItem key={obra.id} value={obra.id}>
                            {obra.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Por Locadora</Label>
                    <Select value={vehicleLocadoraFilter} onValueChange={setVehicleLocadoraFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas as locadoras" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as locadoras</SelectItem>
                        {rentalCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Resultados ({vehicleResults.length} veículos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vehicleLoading ? (
                  <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                ) : vehicleResults.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground">Nenhum veículo encontrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Placa</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Ano</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Locadora</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleResults.map((vehicle) => (
                        <TableRow key={vehicle.id}>
                          <TableCell className="font-medium">{vehicle.placa}</TableCell>
                          <TableCell>{vehicle.marca} {vehicle.modelo}</TableCell>
                          <TableCell>{vehicle.ano}</TableCell>
                          <TableCell>{vehicle.obra_nome}</TableCell>
                          <TableCell>{vehicle.locadora_nome}</TableCell>
                          <TableCell>{getStatusBadge(vehicle.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Serviços Tab */}
          <TabsContent value="servicos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5" />
                  Filtros - Serviços de Manutenção
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Por Status</Label>
                    <Select value={serviceStatusFilter} onValueChange={setServiceStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="agendada">Agendada</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data Inicial</Label>
                    <Input
                      type="date"
                      value={serviceDateFrom}
                      onChange={(e) => setServiceDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Final</Label>
                    <Input
                      type="date"
                      value={serviceDateTo}
                      onChange={(e) => setServiceDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Resultados ({serviceResults.length} serviços)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {serviceLoading ? (
                  <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                ) : serviceResults.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground">Nenhum serviço encontrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Data Agendada</TableHead>
                        <TableHead>Data Realizada</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceResults.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">
                            {service.vehicle_placa} - {service.vehicle_modelo}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {service.tipo === "preventiva" ? "Preventiva" : 
                               service.tipo === "corretiva" ? "Corretiva" : "Emergencial"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{service.descricao}</TableCell>
                          <TableCell>
                            {format(new Date(service.data_agendada), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {service.data_realizada 
                              ? format(new Date(service.data_realizada), "dd/MM/yyyy", { locale: ptBR })
                              : "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(service.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fornecedores Tab */}
          <TabsContent value="fornecedores" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5" />
                  Filtros - Fornecedores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Por Obra</Label>
                    <Select 
                      value={fornecedorObraFilter} 
                      onValueChange={setFornecedorObraFilter}
                      disabled={shouldFilterByObra}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={shouldFilterByObra ? "Sua obra" : "Todas as obras"} />
                      </SelectTrigger>
                      <SelectContent>
                        {!shouldFilterByObra && (
                          <SelectItem value="all">Todas as obras</SelectItem>
                        )}
                        {obras.map((obra) => (
                          <SelectItem key={obra.id} value={obra.id}>
                            {obra.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Por Tipo de Serviço</Label>
                    <Select value={fornecedorTipoFilter} onValueChange={setFornecedorTipoFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os tipos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os tipos</SelectItem>
                        <SelectItem value="materiais">Materiais</SelectItem>
                        <SelectItem value="servicos">Serviços</SelectItem>
                        <SelectItem value="equipamentos">Equipamentos</SelectItem>
                        <SelectItem value="combustivel">Combustível</SelectItem>
                        <SelectItem value="pecas">Peças</SelectItem>
                        <SelectItem value="geral">Geral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Resultados ({fornecedorResults.length} fornecedores)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fornecedorLoading ? (
                  <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                ) : fornecedorResults.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground">Nenhum fornecedor encontrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Obra Vinculada</TableHead>
                        <TableHead>Tipo Contrato</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fornecedorResults.map((fornecedor, index) => (
                        <TableRow key={`${fornecedor.id}-${index}`}>
                          <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {TIPO_FORNECEDOR_LABELS[fornecedor.tipo_fornecedor] || fornecedor.tipo_fornecedor}
                            </Badge>
                          </TableCell>
                          <TableCell>{fornecedor.cidade || "-"}</TableCell>
                          <TableCell>{fornecedor.obra_nome}</TableCell>
                          <TableCell>{fornecedor.tipo_contrato}</TableCell>
                          <TableCell>{getStatusBadge(fornecedor.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Consultas;
