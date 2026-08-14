import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { getEmployeeIdsByObra } from "@/utils/obraFilters";
import type { Database } from "@/integrations/supabase/types";

type Employee = Database['public']['Tables']['employees']['Row'];
type EmployeeInsert = Database['public']['Tables']['employees']['Insert'];
type EmployeeUpdate = Database['public']['Tables']['employees']['Update'];

export type EmployeeWithRelations = Employee & {
  cargos?: { nome: string } | null;
  departamentos?: { nome: string } | null;
};

const EMPLOYEE_SELECT = `*, cargos(nome), departamentos!fk_employees_departamento(nome)`;

export const useEmployees = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { shouldFilterByObra, loading: loadingRole } = useUserRole();
  const { obraId, loading: loadingObra } = useUserObra();

  const QK = ['employees', shouldFilterByObra, obraId] as const;

  const query = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<EmployeeWithRelations[]> => {
      if (shouldFilterByObra) {
        if (!obraId) return [];
        const employeeIds = await getEmployeeIdsByObra(obraId);
        if (!employeeIds.length) return [];
        const { data, error } = await supabase
          .from('employees').select(EMPLOYEE_SELECT)
          .in('id', employeeIds).order('created_at', { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from('employees').select(EMPLOYEE_SELECT).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !loadingRole && !loadingObra,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['employees'] });

  // Traduz erros de constraint do PostgreSQL em mensagens amigáveis
  function friendlyDbError(e: any): string {
    const msg: string = e?.message ?? ''
    if (msg.includes('employees_cpf_key'))    return 'Já existe um funcionário cadastrado com este CPF.'
    if (msg.includes('employees_email_key'))  return 'Já existe um funcionário com este e-mail de login.'
    if (msg.includes('duplicate key'))        return 'Registro duplicado — verifique CPF e e-mail.'
    if (msg.includes('violates foreign key')) return 'Referência inválida — verifique cargo ou obra selecionados.'
    if (msg.includes('null value'))           return 'Preencha todos os campos obrigatórios.'
    return msg
  }

  const createMutation = useMutation({
    mutationFn: async (employeeData: any) => {
      let userId: string | null = null;

      if (employeeData.senha) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_auth_user', {
          p_email: employeeData.email,
          p_password: employeeData.senha,
          p_nome: employeeData.nome,
          p_tipo_acesso: employeeData.tipo_acesso || 'colaborador',
        });
        if (rpcError) {
          toast({ title: "Erro ao criar conta de acesso", description: rpcError.message, variant: "destructive" });
          throw new Error(rpcError.message);
        }
        if (!rpcData?.success) {
          toast({ title: "Erro ao criar conta de acesso", description: rpcData?.error || "Erro desconhecido", variant: "destructive" });
          throw new Error(rpcData?.error || "Erro desconhecido");
        }
        userId = rpcData.user_id;
      }

      const { senha, obra_id, ...employeeDataWithoutPassword } = employeeData;
      const dataToInsert = userId
        ? { ...employeeDataWithoutPassword, user_id: userId }
        : employeeDataWithoutPassword;

      const { data, error } = await supabase
        .from('employees').insert([dataToInsert]).select(EMPLOYEE_SELECT).single();
      if (error) throw error;

      if (obra_id && obra_id !== "") {
        const { error: obraError } = await supabase.from('obra_funcionarios').insert([{
          obra_id, employee_id: data.id,
          funcao_obra: "Colaborador",
          data_entrada: new Date().toISOString().split('T')[0],
          status: true,
        }]);
        toast({
          title: "Funcionário cadastrado",
          description: obraError
            ? "Funcionário criado, mas houve erro ao vincular à obra."
            : "O funcionário foi cadastrado e vinculado à obra com sucesso.",
        });
      } else {
        toast({ title: "Funcionário cadastrado", description: "O funcionário foi cadastrado com sucesso." });
      }

      return data;
    },
    onSuccess: (novo) => {
      // Atualiza o cache imediatamente — novo funcionário aparece sem esperar segundo request
      qc.setQueryData(['employees'], (old: any[] = []) => [novo, ...old]);
      invalidate(); // confirma em background (atualiza relações, ordenação)
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar funcionário", description: friendlyDbError(e), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: EmployeeUpdate & { obra_id?: string } }) => {
      const { obra_id, ...employeeOnly } = d as any;

      const { data, error } = await supabase
        .from('employees').update(employeeOnly).eq('id', id).select(EMPLOYEE_SELECT).single();
      if (error) throw error;

      if (obra_id !== undefined) {
        await supabase.from('obra_funcionarios').update({ status: false }).eq('employee_id', id);
        if (obra_id && obra_id !== "none" && obra_id !== "") {
          await supabase.from('obra_funcionarios').insert([{
            obra_id, employee_id: id,
            funcao_obra: "Colaborador",
            data_entrada: new Date().toISOString().split('T')[0],
            status: true,
          }]);
        }
      }

      if (data.user_id && data.cargo_id) {
        const { data: cargo } = await supabase.from('cargos').select('nivel_acesso').eq('id', data.cargo_id).maybeSingle();
        if ((cargo as any)?.nivel_acesso) {
          await supabase.from('user_roles').upsert(
            { user_id: data.user_id, role: (cargo as any).nivel_acesso },
            { onConflict: 'user_id' }
          );
        }
      }

      return data;
    },
    onSuccess: (atualizado) => {
      qc.setQueryData(['employees'], (old: any[] = []) =>
        old.map(e => e.id === atualizado.id ? atualizado : e),
      );
      invalidate();
      toast({ title: "Funcionário atualizado", description: "O funcionário foi atualizado com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar funcionário", description: friendlyDbError(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, id) => {
      qc.setQueryData(['employees'], (old: any[] = []) => old.filter(e => e.id !== id));
      invalidate();
      toast({ title: "Funcionário excluído", description: "O funcionário foi excluído com sucesso." });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir funcionário", description: friendlyDbError(e), variant: "destructive" }),
  });

  const getEmployeeStats = () => {
    const employees = query.data ?? [];
    return {
      ativo: employees.filter(e => e.status === 'ativo').length,
      inativo: employees.filter(e => e.status === 'inativo').length,
      ferias: employees.filter(e => e.status === 'ferias').length,
      licenca: employees.filter(e => e.status === 'licenca').length,
    };
  };

  return {
    employees: query.data ?? [],
    loading: query.isLoading,
    createEmployee: (d: any) => createMutation.mutateAsync(d),
    updateEmployee: (id: string, d: EmployeeUpdate & { obra_id?: string }) => updateMutation.mutateAsync({ id, d }),
    deleteEmployee: (id: string) => deleteMutation.mutateAsync(id),
    refetchEmployees: query.refetch,
    getEmployeeStats,
  };
};
