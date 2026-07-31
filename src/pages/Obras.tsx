import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Edit, Trash2, Users, Car } from "lucide-react";
import { useObras } from "@/hooks/useObras";
import { useUserRole } from "@/hooks/useUserRole";
import { ObraFormModal } from "@/components/obras/ObraFormModal";
import { ObraDetailModal } from "@/components/obras/ObraDetailModal";
import { VinculacaoFuncionarioModal } from "@/components/obras/VinculacaoFuncionarioModal";
import { VinculacaoVeiculoModal } from "@/components/obras/VinculacaoVeiculoModal";
import { ConfirmDeleteObraModal } from "@/components/obras/ConfirmDeleteObraModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Obras() {
  const { obras, loading, deleteObra, getObraStats } = useObras();
  const { hasObraManagement, isAdmin } = useUserRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isFuncionarioModalOpen, setIsFuncionarioModalOpen] = useState(false);
  const [isVeiculoModalOpen, setIsVeiculoModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedObra, setSelectedObra] = useState<any>(null);

  const stats = getObraStats();

  const filteredObras = obras.filter((obra) => {
    const matchesSearch = obra.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         obra.codigo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         obra.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || obra.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleNewObra = () => {
    setSelectedObra(null);
    setIsFormModalOpen(true);
  };

  const handleEditObra = (obra: any) => {
    setSelectedObra(obra);
    setIsFormModalOpen(true);
  };

  const handleViewObra = (obra: any) => {
    setSelectedObra(obra);
    setIsDetailModalOpen(true);
  };

  const handleDeleteObra = (obra: any) => {
    setSelectedObra(obra);
    setIsDeleteModalOpen(true);
  };

  const handleVincularFuncionarios = (obra: any) => {
    setSelectedObra(obra);
    setIsFuncionarioModalOpen(true);
  };

  const handleVincularVeiculos = (obra: any) => {
    setSelectedObra(obra);
    setIsVeiculoModalOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedObra) {
      await deleteObra(selectedObra.id);
      setIsDeleteModalOpen(false);
      setSelectedObra(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "planejada": return "secondary";
      case "em_andamento": return "default";
      case "pausada": return "destructive";
      case "concluida": return "outline";
      default: return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planejada": return "Planejada";
      case "em_andamento": return "Em Andamento";
      case "pausada": return "Pausada";
      case "concluida": return "Concluída";
      default: return status;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Gestão de Obras</h1>
          <Button onClick={handleNewObra} disabled={!isAdmin}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Obra
          </Button>
        </div>

        {/* Cards de estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Obras
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Planejadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.planejadas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Em Andamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.em_andamento}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pausadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.pausadas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Concluídas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.concluidas}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar por nome, código ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="planejada">Planejada</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Início Previsto</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Carregando obras...
                    </TableCell>
                  </TableRow>
                ) : filteredObras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Nenhuma obra encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredObras.map((obra) => (
                    <TableRow key={obra.id}>
                      <TableCell className="font-medium">{obra.nome}</TableCell>
                      <TableCell>{obra.codigo_interno || "-"}</TableCell>
                      <TableCell>{obra.cliente_nome}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(obra.status)}>
                          {getStatusLabel(obra.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{obra.cidade || "-"}</TableCell>
                      <TableCell>
                        {obra.data_inicio_prevista 
                          ? format(new Date(obra.data_inicio_prevista), "dd/MM/yyyy", { locale: ptBR })
                          : "-"
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewObra(obra)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVincularFuncionarios(obra)}
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVincularVeiculos(obra)}
                          >
                            <Car className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditObra(obra)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteObra(obra)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ObraFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        obra={selectedObra}
      />

      <ObraDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        obra={selectedObra}
      />

      <VinculacaoFuncionarioModal
        isOpen={isFuncionarioModalOpen}
        onClose={() => setIsFuncionarioModalOpen(false)}
        obra={selectedObra}
      />

      <VinculacaoVeiculoModal
        isOpen={isVeiculoModalOpen}
        onClose={() => setIsVeiculoModalOpen(false)}
        obra={selectedObra}
      />

      <ConfirmDeleteObraModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        obraNome={selectedObra?.nome || ""}
      />
    </Layout>
  );
}