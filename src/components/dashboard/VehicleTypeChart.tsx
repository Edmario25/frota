import { useI18n } from "@/i18n";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicles } from "@/hooks/useVehicles";
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";

export function VehicleTypeChart() {
  const { t } = useI18n();
  const { vehicles } = useVehicles();

  const chartData = useMemo(() => {
    const leves = vehicles.filter(v => v.tipo === 'leve');
    const pesados = vehicles.filter(v => v.tipo === 'pesado');

    const leveStats = {
      disponivel: leves.filter(v => v.status === 'disponivel').length,
      em_uso: leves.filter(v => v.status === 'em_uso').length,
      manutencao: leves.filter(v => v.status === 'manutencao').length,
    };

    const pesadoStats = {
      disponivel: pesados.filter(v => v.status === 'disponivel').length,
      em_uso: pesados.filter(v => v.status === 'em_uso').length,
      manutencao: pesados.filter(v => v.status === 'manutencao').length,
    };

    return [
      { 
        name: "Leves", 
        total: leves.length,
        disponivel: leveStats.disponivel,
        em_uso: leveStats.em_uso,
        manutencao: leveStats.manutencao,
        color: "#3b82f6" 
      },
      { 
        name: "Pesados", 
        total: pesados.length,
        disponivel: pesadoStats.disponivel,
        em_uso: pesadoStats.em_uso,
        manutencao: pesadoStats.manutencao,
        color: "#10b981" 
      },
    ];
  }, [vehicles]);

  const total = vehicles.length;

  if (vehicles.length === 0) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <TrendingUp className="h-6 w-6 text-primary" />
            {t("Frota por Tipo")}
          </CardTitle>
          <CardDescription>
            {t("Comparativo entre veículos leves e pesados")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            {t("Nenhum veículo cadastrado")}
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
              <TrendingUp className="h-6 w-6 text-primary" />
              {t("Frota por Tipo")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("Comparativo entre veículos leves e pesados")}
            </CardDescription>
          </div>
          <span className="text-sm font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            {t("{count} total", { count: total })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.map(item => ({ ...item, name: t(item.name) }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" width={80} axisLine={false} tickLine={false} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border-0 rounded-xl p-4 shadow-large">
                        <p className="font-bold text-base mb-2">{data.name}</p>
                        <p className="text-sm">Total: <span className="font-semibold">{data.total}</span></p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span className="text-emerald-600 font-medium">{t("{count} disponíveis", { count: data.disponivel })}</span>
                          <span className="text-blue-600 font-medium">{t("{count} em uso", { count: data.em_uso })}</span>
                          <span className="text-amber-600 font-medium">{t("{count} manutenção", { count: data.manutencao })}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="total" radius={[0, 8, 8, 0]} barSize={40}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend Cards */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          {chartData.map((item) => (
            <div key={item.name} className="p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div 
                  className="w-3.5 h-3.5 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold">{t(item.name)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("Disponíveis")}</p>
                  <p className="font-bold text-emerald-600">{item.disponivel}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("Em Uso")}</p>
                  <p className="font-bold text-blue-600">{item.em_uso}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("Manutenção")}</p>
                  <p className="font-bold text-amber-600">{item.manutencao}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
