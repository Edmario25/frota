import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Trash2, Building, User } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useEmployees } from "@/hooks/useEmployees";
import { DepartamentoFormModal } from "@/components/departamentos/DepartamentoFormModal";
import { ConfirmDeleteDepartamentoModal } from "@/components/departamentos/ConfirmDeleteDepartamentoModal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { Database } from "@/integrations/supabase/types";

type Departamento = Database['public']['Tables']['departamentos']['Row'];

const Departamentos = () => {
  const { departamentos, loading, createDepartamento, updateDepartamento, deleteDepartamento } = useDepartamentos();
  const { employees } = useEmployees();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDepartamento, setSelectedDepartamento] = useState<Departamento | null>(null);

  const filteredDepartamentos = departamentos.filter((d) =>
    d.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.descricao || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getResponsavelNome = (responsavel_id: string | null) => {
    if (!responsavel_id) return null;
    return employees.find((e) => e.id === responsavel_id)?.nome || null;
  };

  const handleCreate = async (data: any) => {
    await createDepartamento(data);
  };

  const handleUpdate = async (data: any) => {
    if (selectedDepartamento) {
      await updateDepartamento(selectedDepartamento.id, data);
    }
  };

  const handleDelete = async () => {
    if (selectedDepartamento) {
      await deleteDepartamento(selectedDepartamento.id);
      setIsDeleteModalOpen(false);
      setSelectedDepartamento(null);
    }
  };

  const openEditModal = (departamento: Departamento) => {
    setSelectedDepartamento(departamento);
    setIsFormModalOpen(true);
  };

  const openDeleteModal = (departamento: Departamento) => {
    setSelectedDepartamento(departamento);
    setIsDeleteModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelectedDepartamento(null);
  };

  if (loading) return <PageSkeleton statsCount={0} columns={4} rows={6} />;

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">Departamentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie os departamentos da empresa</p>
          </div>
          <Button size="sm" onClick={() => setIsFormModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Novo Departamento
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {[
            { label: "Total", value: departamentos.length, color: "text-primary" },
            {
              label: "Com Responsável",
              value: departamentos.filter((d) => d.responsavel_id).length,
              color: "text-emerald-600",
            },
            {
              label: "Sem Responsável",
              value: departamentos.filter((d) => !d.responsavel_id).length,
              color: "text-amber-600",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar departamento..."
            className="pl-8 h-8 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Departamento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDepartamentos.map((departamento) => {
                const responsavel = getResponsavelNome(departamento.responsavel_id);
                return (
                  <TableRow key={departamento.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{departamento.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {departamento.descricao || <span className="italic text-muted-foreground/60">Sem descrição</span>}
                    </TableCell>
                    <TableCell>
                      {responsavel ? (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{responsavel}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Não definido
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => openEditModal(departamento)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => openDeleteModal(departamento)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredDepartamentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "Nenhum departamento encontrado para a busca." : "Nenhum departamento cadastrado."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Modals */}
        <DepartamentoFormModal
          open={isFormModalOpen}
          onOpenChange={closeFormModal}
          departamento={selectedDepartamento || undefined}
          onSubmit={selectedDepartamento ? handleUpdate : handleCreate}
        />

        <ConfirmDeleteDepartamentoModal
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
          departamento={selectedDepartamento}
          onConfirm={handleDelete}
        />
      </div>
    </Layout>
  );
};

export default Departamentos;
