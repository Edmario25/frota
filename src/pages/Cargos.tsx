import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2, ShieldCheck, Shield, User, Briefcase } from "lucide-react";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useCargos } from "@/hooks/useCargos";
import { CargoFormModal } from "@/components/cargos/CargoFormModal";
import { ConfirmDeleteCargoModal } from "@/components/cargos/ConfirmDeleteCargoModal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { Database } from "@/integrations/supabase/types";

type Cargo = Database['public']['Tables']['cargos']['Row'];

const nivelAcessoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  funcionario:     { label: "Funcionário",        color: "bg-emerald-100 text-emerald-700", icon: User },
  gestor_obra:     { label: "Gestor de Obras",     color: "bg-amber-100 text-amber-700",    icon: Shield },
  gestor_contrato: { label: "Gestor de Contratos", color: "bg-violet-100 text-violet-700",  icon: ShieldCheck },
};

const Cargos = () => {
  const { cargos, loading, createCargo, updateCargo, deleteCargo } = useCargos();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);

  const filtered = cargos.filter((c) =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.descricao || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEditModal  = (c: Cargo) => { setSelectedCargo(c); setIsFormModalOpen(true); };
  const openDeleteModal = (c: Cargo) => { setSelectedCargo(c); setIsDeleteModalOpen(true); };
  const closeFormModal  = () => { setIsFormModalOpen(false); setSelectedCargo(null); };

  const handleDelete = async () => {
    if (!selectedCargo) return;
    await deleteCargo(selectedCargo.id);
    setIsDeleteModalOpen(false);
    setSelectedCargo(null);
  };

  if (loading) return <PageSkeleton statsCount={0} columns={4} rows={6} />;

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">Cargos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie os cargos e as permissões de acesso por função
            </p>
          </div>
          <Button size="sm" onClick={() => setIsFormModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Novo Cargo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Total de Cargos", value: cargos.length, color: "text-primary" },
            {
              label: "Funcionários",
              value: cargos.filter((c) => c.nivel_acesso === "funcionario").length,
              color: "text-emerald-600",
            },
            {
              label: "Gest. de Obras",
              value: cargos.filter((c) => c.nivel_acesso === "gestor_obra").length,
              color: "text-amber-600",
            },
            {
              label: "Gest. Contratos",
              value: cargos.filter((c) => c.nivel_acesso === "gestor_contrato").length,
              color: "text-violet-600",
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
            placeholder="Buscar cargo..."
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
                <TableHead>Cargo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Nível Hier.</TableHead>
                <TableHead>Permissão de Acesso</TableHead>
                <TableHead className="w-[90px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cargo) => {
                const cfg = nivelAcessoConfig[cargo.nivel_acesso] ?? nivelAcessoConfig.funcionario;
                const Icon = cfg.icon;
                return (
                  <TableRow key={cargo.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{cargo.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {cargo.descricao || <span className="italic text-muted-foreground/50">Sem descrição</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        Nível {cargo.nivel_hierarquico ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${cfg.color} border-0 text-xs flex items-center gap-1 w-fit`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => openEditModal(cargo)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => openDeleteModal(cargo)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "Nenhum cargo encontrado para a busca." : "Nenhum cargo cadastrado."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <CargoFormModal
          open={isFormModalOpen}
          onOpenChange={closeFormModal}
          cargo={selectedCargo || undefined}
          onSubmit={selectedCargo
            ? (d) => updateCargo(selectedCargo.id, d)
            : createCargo}
        />
        <ConfirmDeleteCargoModal
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
          cargo={selectedCargo}
          onConfirm={handleDelete}
        />
      </div>
    </Layout>
  );
};

export default Cargos;
