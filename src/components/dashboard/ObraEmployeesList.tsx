import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Building2 } from "lucide-react";
import { getEmployeeStatusDot, getEmployeeStatusText } from "@/lib/statusHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useUserObra } from "@/hooks/useUserObra";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface ObraEmployee {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  foto_url: string | null;
  status: string;
  funcao_obra: string;
  cargo_nome: string | null;
}

export const ObraEmployeesList = () => {
  const { t } = useI18n();
  const { obraId, obraNome, loading: loadingObra } = useUserObra();
  const [employees, setEmployees] = useState<ObraEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchObraEmployees = async () => {
      if (loadingObra) return;

      if (!obraId) {
        setEmployees([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const { data: vinculacoes, error: vinculacoesError } = await supabase
          .from('obra_funcionarios')
          .select('employee_id, funcao_obra, status')
          .eq('obra_id', obraId)
          .eq('status', true);

        if (vinculacoesError) throw vinculacoesError;

        if (!vinculacoes || vinculacoes.length === 0) {
          setEmployees([]);
          setLoading(false);
          return;
        }

        const employeeIds = vinculacoes.map(v => v.employee_id);

        const { data: employeesData, error: employeesError } = await supabase
          .from('employees')
          .select(`
            id,
            nome,
            email,
            telefone,
            foto_url,
            status,
            cargos(nome)
          `)
          .in('id', employeeIds);

        if (employeesError) throw employeesError;

        const combinedData: ObraEmployee[] = (employeesData || []).map(emp => {
          const vinculacao = vinculacoes.find(v => v.employee_id === emp.id);
          return {
            id: emp.id,
            nome: emp.nome,
            email: emp.email,
            telefone: emp.telefone,
            foto_url: emp.foto_url,
            status: emp.status,
            funcao_obra: vinculacao?.funcao_obra || '',
            cargo_nome: emp.cargos?.nome || null
          };
        });

        setEmployees(combinedData);
      } catch (error) {
        console.error('Erro ao buscar funcionários da obra:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchObraEmployees();
  }, [obraId, loadingObra]);

  if (loadingObra || loading) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            {t("Funcionários da Obra")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!obraId) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            {t("Funcionários da Obra")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            {t("Você não está vinculado a nenhuma obra.")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-medium rounded-2xl overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            {t("Funcionários da Obra")}
          </CardTitle>
          {obraNome && (
            <Badge 
              variant="outline" 
              className="font-semibold text-sm px-4 py-1.5 bg-slate-100 text-slate-700 border-0 rounded-full uppercase tracking-wide"
            >
              {obraNome}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {t("{count} funcionários vinculados", { count: employees.length })}
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        {employees.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t("Nenhum funcionário vinculado a esta obra.")}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all duration-200"
              >
                <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
                  <AvatarImage src={emp.foto_url || undefined} alt={emp.nome} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-blue-600 text-white font-bold text-sm">
                    {emp.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{emp.nome}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate">{emp.funcao_obra || emp.cargo_nome || t('Sem função')}</span>
                  </div>
                </div>
                <Badge className={cn("text-xs font-semibold px-3 py-1 rounded-full", getEmployeeStatusDot(emp.status))}>
                  {t(getEmployeeStatusText(emp.status))}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
