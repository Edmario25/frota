import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { HardHat, MapPin, Users, Car, TrendingUp, ChevronRight } from "lucide-react";
import { getObraStatusColor, getObraStatusText } from "@/lib/statusHelpers";
import { useObras } from "@/hooks/useObras";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";

interface ObraResumo {
  id: string;
  nome: string;
  status: string;
  cidade: string | null;
  estado: string | null;
  funcionarios_count: number;
  veiculos_count: number;
}

export function ObrasSummaryCard() {
  const { t } = useI18n();
  const { obras, getObraStats, loading } = useObras();
  const [obrasResumo, setObrasResumo] = useState<ObraResumo[]>([]);
  const stats = getObraStats();

  useEffect(() => {
    const fetchObraDetails = async () => {
      if (obras.length === 0) return;

      const resumos: ObraResumo[] = [];
      
      for (const obra of obras.slice(0, 4)) {
        const { count: funcCount } = await supabase
          .from('obra_funcionarios')
          .select('*', { count: 'exact', head: true })
          .eq('obra_id', obra.id)
          .eq('status', true);

        const { count: vehCount } = await supabase
          .from('obra_veiculos')
          .select('*', { count: 'exact', head: true })
          .eq('obra_id', obra.id)
          .eq('status', true);

        resumos.push({
          id: obra.id,
          nome: obra.nome,
          status: obra.status,
          cidade: obra.cidade || null,
          estado: obra.estado || null,
          funcionarios_count: funcCount || 0,
          veiculos_count: vehCount || 0,
        });
      }

      setObrasResumo(resumos);
    };

    fetchObraDetails();
  }, [obras]);

  const obrasEmAndamento = stats.em_andamento;
  const totalObras = stats.total;
  const progressPercent = totalObras > 0 ? (obrasEmAndamento / totalObras) * 100 : 0;

  if (loading) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <HardHat className="h-6 w-6 text-primary" />
            {t("Resumo de Obras")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-medium rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-3 text-xl font-bold">
              <HardHat className="h-6 w-6 text-primary" />
              {t("Resumo de Obras")}
            </CardTitle>
            <CardDescription className="mt-1">{t("Visão geral dos projetos ativos")}</CardDescription>
          </div>
          <Link 
            to="/obras" 
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {t("Ver todas")}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted/30 rounded-xl">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground font-medium">{t("Total")}</p>
          </div>
          <div className="text-center p-4 bg-emerald-50 rounded-xl">
            <p className="text-2xl font-bold text-emerald-600">{stats.em_andamento}</p>
            <p className="text-xs text-muted-foreground font-medium">{t("Ativas")}</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <p className="text-2xl font-bold text-amber-600">{stats.pausadas}</p>
            <p className="text-xs text-muted-foreground font-medium">{t("Pausadas")}</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <p className="text-2xl font-bold text-blue-600">{stats.concluidas}</p>
            <p className="text-xs text-muted-foreground font-medium">{t("Concluídas")}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-medium">{t("Obras em andamento")}</span>
            <span className="font-semibold">{t("{current} de {total}", { current: obrasEmAndamento, total: totalObras })}</span>
          </div>
          <Progress value={progressPercent} className="h-2.5 rounded-full" />
        </div>

        {/* Obras List */}
        {obrasResumo.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t("Principais Obras")}
            </h4>
            {obrasResumo.map((obra) => (
              <div 
                key={obra.id} 
                className="flex items-center justify-between p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-all duration-200"
              >
                <div className="space-y-1">
                  <p className="font-semibold">{obra.nome}</p>
                  {obra.cidade && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {obra.cidade}{obra.estado && `, ${obra.estado}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{obra.funcionarios_count}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Car className="h-4 w-4" />
                    <span className="font-medium">{obra.veiculos_count}</span>
                  </div>
                  <Badge className={`text-xs font-semibold px-3 py-1 rounded-full ${getObraStatusColor(obra.status)}`}>
                    {t(getObraStatusText(obra.status))}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {t("Nenhuma obra cadastrada")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
