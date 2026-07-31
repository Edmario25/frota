import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useObras } from "@/hooks/useObras";
import { useEmployees } from "@/hooks/useEmployees";
import { format } from "date-fns";

interface ObraFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra?: any;
}

export function ObraFormModal({ isOpen, onClose, obra }: ObraFormModalProps) {
  const { createObra, updateObra } = useObras();
  const { employees, refetchEmployees } = useEmployees();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    codigo_interno: "",
    endereco: "",
    cidade: "",
    estado: "",
    coordenadas_gps: "",
    cliente_nome: "",
    cliente_cnpj: "",
    data_inicio_prevista: "",
    data_termino_prevista: "",
    status: "planejada",
    responsavel_tecnico: "",
    responsavel_tecnico_id: "",
    observacoes: "",
  });

  useEffect(() => {
    if (isOpen) {
      refetchEmployees(); // Recarregar funcionários sempre que abrir
    }
    
    if (obra) {
      setFormData({
        nome: obra.nome || "",
        codigo_interno: obra.codigo_interno || "",
        endereco: obra.endereco || "",
        cidade: obra.cidade || "",
        estado: obra.estado || "",
        coordenadas_gps: obra.coordenadas_gps || "",
        cliente_nome: obra.cliente_nome || "",
        cliente_cnpj: obra.cliente_cnpj || "",
        data_inicio_prevista: obra.data_inicio_prevista || "",
        data_termino_prevista: obra.data_termino_prevista || "",
        status: obra.status || "planejada",
        responsavel_tecnico: obra.responsavel_tecnico || "",
        responsavel_tecnico_id: obra.responsavel_tecnico_id || "",
        observacoes: obra.observacoes || "",
      });
    } else {
      setFormData({
        nome: "",
        codigo_interno: "",
        endereco: "",
        cidade: "",
        estado: "",
        coordenadas_gps: "",
        cliente_nome: "",
        cliente_cnpj: "",
        data_inicio_prevista: "",
        data_termino_prevista: "",
        status: "planejada",
        responsavel_tecnico: "",
        responsavel_tecnico_id: "",
        observacoes: "",
      });
    }
  }, [obra, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        data_inicio_prevista: formData.data_inicio_prevista || null,
        data_termino_prevista: formData.data_termino_prevista || null,
        responsavel_tecnico_id: formData.responsavel_tecnico_id || null,
      };

      if (obra) {
        await updateObra(obra.id, data);
      } else {
        await createObra(data);
      }
      onClose();
    } catch (error) {
      console.error("Erro ao salvar obra:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{obra ? "Editar Obra" : "Nova Obra"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">Nome da Obra *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="codigo_interno">Código Interno</Label>
              <Input
                id="codigo_interno"
                value={formData.codigo_interno}
                onChange={(e) => handleChange("codigo_interno", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="endereco">Endereço</Label>
            <Input
              id="endereco"
              value={formData.endereco}
              onChange={(e) => handleChange("endereco", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                value={formData.cidade}
                onChange={(e) => handleChange("cidade", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Input
                id="estado"
                value={formData.estado}
                onChange={(e) => handleChange("estado", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="coordenadas_gps">Coordenadas GPS</Label>
            <Input
              id="coordenadas_gps"
              value={formData.coordenadas_gps}
              onChange={(e) => handleChange("coordenadas_gps", e.target.value)}
              placeholder="Ex: -15.7942, -47.8822"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cliente_nome">Cliente/Contratante *</Label>
              <Input
                id="cliente_nome"
                value={formData.cliente_nome}
                onChange={(e) => handleChange("cliente_nome", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="cliente_cnpj">CNPJ do Cliente</Label>
              <Input
                id="cliente_cnpj"
                value={formData.cliente_cnpj}
                onChange={(e) => handleChange("cliente_cnpj", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="data_inicio_prevista">Data de Início Prevista</Label>
              <Input
                id="data_inicio_prevista"
                type="date"
                value={formData.data_inicio_prevista}
                onChange={(e) => handleChange("data_inicio_prevista", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="data_termino_prevista">Data de Término Prevista</Label>
              <Input
                id="data_termino_prevista"
                type="date"
                value={formData.data_termino_prevista}
                onChange={(e) => handleChange("data_termino_prevista", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status da Obra *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => handleChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejada">Planejada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="responsavel_tecnico_id">Responsável Técnico</Label>
              <Select 
                value={formData.responsavel_tecnico_id} 
                onValueChange={(value) => handleChange("responsavel_tecnico_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável técnico" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <SelectItem value="no-employees" disabled>Nenhum funcionário disponível</SelectItem>
                  ) : (
                    employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.nome} - {employee.cargos?.nome || "Sem cargo"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="responsavel_tecnico">Responsável (texto legado)</Label>
            <Input
              id="responsavel_tecnico"
              value={formData.responsavel_tecnico}
              onChange={(e) => handleChange("responsavel_tecnico", e.target.value)}
              placeholder="Campo legado - use o campo responsável técnico acima"
            />
          </div>

          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange("observacoes", e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : obra ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}