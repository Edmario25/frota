import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Users, AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EquipesObraModal } from "./EquipesObraModal";

interface VinculacaoFuncionarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  obra: any;
}

export function VinculacaoFuncionarioModal({ isOpen, onClose, obra }: VinculacaoFuncionarioModalProps) {
  const { employees, refetchEmployees } = useEmployees();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [vinculacoes, setVinculacoes] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showEquipes, setShowEquipes] = useState(false);
  const [treinStatusMap, setTreinStatusMap] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    employee_id: "",
    funcao_obra: "",
    data_entrada: new Date().toISOString().split('T')[0],
    data_saida: "",
    status: true,
  });

  useEffect(() => {
    if (isOpen && obra) {
      fetchVinculacoes();
      refetchEmployees();
    }
  }, [isOpen, obra]);

  // Busca status de treinamentos para cada vinculado
  const fetchTreinStatus = async (employeeIds: string[]) => {
    if (employeeIds.length === 0) return;
    const hoje = new Date().toISOString().split("T")[0];
    const { data } = await (supabase as any)
      .from("sms_colaborador_treinamentos")
      .select("colaborador_id, status, data_vencimento")
      .in("colaborador_id", employeeIds);

    const map: Record<string, string> = {};
    for (const id of employeeIds) {
      const registros = (data ?? []).filter((r: any) => r.colaborador_id === id);
      if (registros.length === 0) { map[id] = "sem_dados"; continue; }
      if (registros.some((r: any) => r.status === "vencido")) { map[id] = "vencido"; continue; }
      if (registros.some((r: any) => r.status === "a_vencer")) { map[id] = "a_vencer"; continue; }
      map[id] = "em_dia";
    }
    setTreinStatusMap(map);
  };

  const fetchVinculacoes = async () => {
    if (!obra) return;
    
    console.log('Buscando vinculações para obra:', obra.id);
    
    try {
      // Fallback approach - get vinculacoes first, then employee data separately
      const { data: basicVinculacoes, error: basicError } = await supabase
        .from('obra_funcionarios' as any)
        .select('*')
        .eq('obra_id', obra.id)
        .order('created_at', { ascending: false });
        
      if (basicError) throw basicError;
      
      console.log('Vinculações encontradas:', basicVinculacoes);
      
      // Then get employee data for each vinculacao
      const enrichedVinculacoes = await Promise.all(
        (basicVinculacoes || []).map(async (vinculacao: any) => {
          const { data: employeeData } = await supabase
            .from('employees')
            .select(`
              id, nome,
              cargos (nome),
              departamentos!fk_employees_departamento (nome)
            `)
            .eq('id', vinculacao.employee_id)
            .single();
            
          return {
            ...vinculacao,
            employees: employeeData
          };
        })
      );
      
      console.log('Vinculações enriquecidas:', enrichedVinculacoes);
      setVinculacoes(enrichedVinculacoes);
      fetchTreinStatus(enrichedVinculacoes.map((v: any) => v.employee_id).filter(Boolean));
    } catch (error) {
      console.error('Erro ao buscar vinculações:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar funcionários vinculados",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('obra_funcionarios' as any)
        .insert([{
          obra_id: obra.id,
          ...formData,
          data_saida: formData.data_saida || null,
        }]);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Funcionário vinculado com sucesso",
      });

      setFormData({
        employee_id: "",
        funcao_obra: "",
        data_entrada: new Date().toISOString().split('T')[0],
        data_saida: "",
        status: true,
      });
      setShowForm(false);
      fetchVinculacoes();
    } catch (error) {
      console.error('Erro ao vincular funcionário:', error);
      toast({
        title: "Erro",
        description: "Erro ao vincular funcionário",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveVinculacao = async (id: string) => {
    try {
      const { error } = await supabase
        .from('obra_funcionarios' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Vinculação removida com sucesso",
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

  const availableEmployees = employees.filter(emp => 
    !vinculacoes.some(v => v.employee_id === emp.id && v.status)
  );

  if (!obra) return null;

  return (
    <>
    <EquipesObraModal isOpen={showEquipes} onClose={() => setShowEquipes(false)} obra={obra} />
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Funcionários - {obra.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-lg font-semibold">Funcionários Vinculados</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEquipes(true)}>
                <Users className="h-4 w-4 mr-2 text-violet-500" />
                Equipes
              </Button>
              <Button onClick={() => setShowForm(true)} disabled={showForm}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="border p-4 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="employee_id">Funcionário *</Label>
                  <Select 
                    value={formData.employee_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, employee_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um funcionário" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.length === 0 ? (
                        <SelectItem value="no-employees" disabled>Nenhum funcionário disponível</SelectItem>
                      ) : (
                        availableEmployees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.nome} - {employee.cargos?.nome || "Sem cargo"}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="funcao_obra">Função na Obra *</Label>
                  <Input
                    id="funcao_obra"
                    value={formData.funcao_obra}
                    onChange={(e) => setFormData(prev => ({ ...prev, funcao_obra: e.target.value }))}
                    placeholder="Ex: Operador, Motorista, Supervisor"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <TableHead>Funcionário</TableHead>
                <TableHead>Função na Obra</TableHead>
                <TableHead>Treinamentos</TableHead>
                <TableHead>Data Entrada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vinculacoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    Nenhum funcionário vinculado
                  </TableCell>
                </TableRow>
              ) : (
                vinculacoes.map((vinculacao) => (
                  <TableRow key={vinculacao.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{vinculacao.employees?.nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {vinculacao.employees?.cargos?.nome} - {vinculacao.employees?.departamentos?.nome}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{vinculacao.funcao_obra}</TableCell>
                    <TableCell>
                      {(() => {
                        const st = treinStatusMap[vinculacao.employee_id];
                        if (!st || st === "sem_dados") return (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <HelpCircle className="h-3.5 w-3.5" /> Sem dados
                          </span>
                        );
                        if (st === "vencido") return (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Vencido
                          </span>
                        );
                        if (st === "a_vencer") return (
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Clock className="h-3.5 w-3.5" /> A vencer
                          </span>
                        );
                        return (
                          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Em dia
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {format(new Date(vinculacao.data_entrada), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vinculacao.status ? "default" : "secondary"}>
                        {vinculacao.status ? "Ativo" : "Inativo"}
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
    </>
  );
}