import React, { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Pencil, Trash2, Building2 } from "lucide-react";
import { useFornecedores, Fornecedor } from "@/hooks/useFornecedores";
import { FornecedorFormModal } from "@/components/fornecedores/FornecedorFormModal";
import { FornecedorDetailModal } from "@/components/fornecedores/FornecedorDetailModal";
import { ConfirmDeleteFornecedorModal } from "@/components/fornecedores/ConfirmDeleteFornecedorModal";
import { formatCnpj, formatCpf, onlyDigits } from "@/utils/documentValidation";

const TIPO_LABELS: Record<string, string> = {
  materiais: "Materiais",
  servicos: "Serviços",
  equipamentos: "Equipamentos",
  combustivel: "Combustível",
  pecas: "Peças",
  geral: "Geral",
};

const Fornecedores = () => {
  const { fornecedores, loading, deleteFornecedor } = useFornecedores();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);

  const normalizedSearch = searchTerm.toLowerCase().trim();
  const digitSearch = onlyDigits(searchTerm);
  const filteredFornecedores = fornecedores.filter(
    (f) =>
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (digitSearch && onlyDigits(f.cnpj ?? f.cpf ?? "").includes(digitSearch)) ||
      f.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.telefone?.toLowerCase().includes(normalizedSearch) ||
      f.cidade?.toLowerCase().includes(normalizedSearch) ||
      f.estado?.toLowerCase().includes(normalizedSearch) ||
      f.tipo_fornecedor?.toLowerCase().includes(normalizedSearch) ||
      f.status?.toLowerCase().includes(normalizedSearch)
  );

  const handleView = (fornecedor: Fornecedor) => {
    setSelectedFornecedor(fornecedor);
    setIsDetailModalOpen(true);
  };

  const handleEdit = (fornecedor: Fornecedor) => {
    setSelectedFornecedor(fornecedor);
    setIsFormModalOpen(true);
  };

  const handleDelete = (fornecedor: Fornecedor) => {
    setSelectedFornecedor(fornecedor);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedFornecedor) {
      await deleteFornecedor(selectedFornecedor.id);
      setIsDeleteModalOpen(false);
      setSelectedFornecedor(null);
    }
  };

  const handleNewFornecedor = () => {
    setSelectedFornecedor(null);
    setIsFormModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ativo":
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>;
      case "inativo":
        return <Badge className="bg-gray-100 text-gray-800">Inativo</Badge>;
      case "bloqueado":
        return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Fornecedores
            </h1>
            <p className="text-muted-foreground">
              Gerencie os fornecedores e seus vínculos com as obras
            </p>
          </div>
          <Button onClick={handleNewFornecedor}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Fornecedor
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Carregando fornecedores...</p>
          </div>
        ) : filteredFornecedores.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cidade/Estado</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFornecedores.map((fornecedor) => (
                  <TableRow
                    key={fornecedor.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleView(fornecedor)}
                  >
                    <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                    <TableCell>{fornecedor.cnpj ? formatCnpj(fornecedor.cnpj) : fornecedor.cpf ? formatCpf(fornecedor.cpf) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TIPO_LABELS[fornecedor.tipo_fornecedor] || fornecedor.tipo_fornecedor}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {fornecedor.cidade && fornecedor.estado
                        ? `${fornecedor.cidade}/${fornecedor.estado}`
                        : fornecedor.cidade || fornecedor.estado || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {fornecedor.telefone && <div>{fornecedor.telefone}</div>}
                        {fornecedor.email && (
                          <div className="text-muted-foreground text-xs">{fornecedor.email}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(fornecedor.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Visualizar fornecedor"
                          aria-label={`Visualizar ${fornecedor.nome}`}
                          onClick={() => handleView(fornecedor)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar fornecedor"
                          aria-label={`Editar ${fornecedor.nome}`}
                          onClick={() => handleEdit(fornecedor)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Inativar fornecedor"
                          aria-label={`Inativar ${fornecedor.nome}`}
                          onClick={() => handleDelete(fornecedor)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {isFormModalOpen && (
        <FornecedorFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setSelectedFornecedor(null);
          }}
          fornecedor={selectedFornecedor}
        />
      )}

      {isDetailModalOpen && (
        <FornecedorDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedFornecedor(null);
          }}
          fornecedor={selectedFornecedor}
          onEdit={() => {
            setIsDetailModalOpen(false);
            setIsFormModalOpen(true);
          }}
        />
      )}

      {isDeleteModalOpen && (
        <ConfirmDeleteFornecedorModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedFornecedor(null);
          }}
          onConfirm={confirmDelete}
          fornecedorName={selectedFornecedor?.nome || ""}
        />
      )}
    </Layout>
  );
};

export default Fornecedores;
