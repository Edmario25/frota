import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVehicles } from "@/hooks/useVehicles";
import { useEmployees } from "@/hooks/useEmployees";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VinculacaoVeiculoModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra: any;
}

export function VinculacaoVeiculoModal({ isOpen, onClose, obra }: VinculacaoVeiculoModalProps) {
  const { vehicles } = useVehicles();
  const { employees } = useEmployees();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [vinculacoes, setVinculacoes] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_id: "",
    tipo_vinculo: "compartilhado",
    responsavel_id: "",
    data_entrada: new Date().toISOString().split('T')[0],
    data_saida: "",
    status: true,
  });

  useEffect(() => {
    if (isOpen && obra) {
      fetchVinculacoes();
    }
  }, [isOpen, obra]);

  const fetchVinculacoes = async () => {
    if (!obra) return;
    
    try {
      // Fallback approach - get vinculacoes first, then related data separately  
      const { data: basicVinculacoes, error: basicError } = await supabase
        .from('obra_veiculos' as any)
        .select('*')
        .eq('obra_id', obra.id)
        .order('created_at', { ascending: false });
        
      if (basicError) throw basicError;
      
      // Then get vehicle and employee data for each vinculacao
      const enrichedVinculacoes = await Promise.all(
        (basicVinculacoes || []).map(async (vinculacao: any) => {
          const [vehicleData, employeeData] = await Promise.all([
            supabase
              .from('vehicles')
              .select('id, placa, modelo, marca, tipo')
              .eq('id', vinculacao.vehicle_id)
              .single(),
            vinculacao.responsavel_id 
              ? supabase
                  .from('employees')
                  .select('id, nome')
                  .eq('id', vinculacao.responsavel_id)
                  .single()
              : Promise.resolve({ data: null })
          ]);
            
          return {
            ...vinculacao,
            vehicles: vehicleData.data,
            employees: employeeData.data
          };
        })
      );
      
      setVinculacoes(enrichedVinculacoes);
    } catch (error) {
      console.error('Erro ao buscar vinculações:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar veículos vinculados",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await (supabase as any).rpc('vincular_veiculo_obra', {
        p_vehicle_id: formData.vehicle_id,
        p_obra_id: obra.id,
        p_tipo_vinculo: formData.tipo_vinculo,
      });

      if (error) throw error;

      const { error: detalhesError } = await supabase
        .from('obra_veiculos' as any)
        .update({
          responsavel_id: formData.responsavel_id || null,
          data_entrada: formData.data_entrada,
          updated_at: new Date().toISOString(),
        })
        .eq('vehicle_id', formData.vehicle_id)
        .eq('obra_id', obra.id)
        .eq('status', true);
      if (detalhesError) throw detalhesError;

      toast({
        title: "Sucesso",
        description: "Veículo alocado com sucesso; vínculos anteriores foram encerrados",
      });

      setFormData({
        vehicle_id: "",
        tipo_vinculo: "compartilhado",
        responsavel_id: "",
        data_entrada: new Date().toISOString().split('T')[0],
        data_saida: "",
        status: true,
      });
      setShowForm(false);
      fetchVinculacoes();
    } catch (error) {
      console.error('Erro ao vincular veículo:', error);
      toast({
        title: "Erro",
        description: "Erro ao vincular veículo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveVinculacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('obra_veiculos' as any)
        .update({ status: false, data_saida: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', true);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Alocação encerrada e histórico preservado",
      });
      fetchVinculacoes();
    } catch (error) {
      console.error('Erro ao remover vinculação:', error);
      toast({
        title: "Erro",
        description: "Erro ao remover vinculação",
        variant: "destructive",
      });
    }
  };

  if (!obra) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Veículos - {obra.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Veículos Vinculados</h3>
            <Button onClick={() => setShowForm(true)} disabled={showForm}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Veículo
            </Button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="border p-4 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vehicle_id">Veículo *</Label>
                  <Select 
                    value={formData.vehicle_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, vehicle_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.placa} - {vehicle.marca} {vehicle.modelo} ({vehicle.tipo})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tipo_vinculo">Tipo de Vínculo *</Label>
                  <Select 
                    value={formData.tipo_vinculo} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, tipo_vinculo: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusivo">Uso Exclusivo</SelectItem>
                      <SelectItem value="compartilhado">Compartilhado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="responsavel_id">Responsável (opcional)</Label>
                  <Select 
                    value={formData.responsavel_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, responsavel_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="data_entrada">Data de Entrada *</Label>
                  <Input
                    id="data_entrada"
                    type="date"
                    value={formData.data_entrada}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_entrada: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="data_saida">Data de Saída (opcional)</Label>
                  <Input
                    id="data_saida"
                    type="date"
                    value={formData.data_saida}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_saida: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Vinculando..." : "Vincular"}
                </Button>
              </div>
            </form>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Tipo de Vínculo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Data Entrada</TableHead>
                <TableHead>Data Saída</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vinculacoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4">
                    Nenhum veículo vinculado
                  </TableCell>
                </TableRow>
              ) : (
                vinculacoes.map((vinculacao) => (
                  <TableRow key={vinculacao.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{vinculacao.vehicles?.placa}</p>
                        <p className="text-sm text-muted-foreground">
                          {vinculacao.vehicles?.marca} {vinculacao.vehicles?.modelo}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={vinculacao.tipo_vinculo === 'exclusivo' ? 'default' : 'secondary'}>
                        {vinculacao.tipo_vinculo === 'exclusivo' ? 'Exclusivo' : 'Compartilhado'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {vinculacao.employees?.nome || "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(vinculacao.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {vinculacao.data_saida 
                        ? format(new Date(vinculacao.data_saida), "dd/MM/yyyy", { locale: ptBR })
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={vinculacao.status ? "default" : "secondary"}>
                        {vinculacao.status ? "Ativo" : "Retirado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveVinculacao(vinculacao.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
