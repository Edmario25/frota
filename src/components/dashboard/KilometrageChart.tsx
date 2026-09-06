import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicles } from "@/hooks/useVehicles";
import { useMemo } from "react";
import { Gauge } from "lucide-react";
import { useI18n } from "@/i18n";

export function KilometrageChart() {
  const { t, number } = useI18n();
  const { vehicles } = useVehicles();

  const chartData = useMemo(() => {
    const ranges = [
      { range: "0-10k", min: 0, max: 10000, leves: 0, pesados: 0 },
      { range: "10k-30k", min: 10000, max: 30000, leves: 0, pesados: 0 },
      { range: "30k-50k", min: 30000, max: 50000, leves: 0, pesados: 0 },
      { range: "50k-100k", min: 50000, max: 100000, leves: 0, pesados: 0 },
      { range: "100k+", min: 100000, max: Infinity, leves: 0, pesados: 0 },
    ];

    vehicles.forEach(vehicle => {
      const km = vehicle.quilometragem_atual || 0;
      const tipo = vehicle.tipo;
      
      for (const range of ranges) {
        if (km >= range.min && km < range.max) {
          if (tipo === 'leve') {
            range.leves++;
          } else {
            range.pesados++;
          }
          break;
        }
      }
    });

    return ranges.map(r => ({
      range: r.range,
      leves: r.leves,
      pesados: r.pesados,
      total: r.leves + r.pesados,
    }));
  }, [vehicles]);

  const totalKmLeves = vehicles
    .filter(v => v.tipo === 'leve')
    .reduce((sum, v) => sum + (v.quilometragem_atual || 0), 0);
  
  const totalKmPesados = vehicles
    .filter(v => v.tipo === 'pesado')
    .reduce((sum, v) => sum + (v.quilometragem_atual || 0), 0);

  const formatKm = (km: number) => {
    return number(km, { notation: "compact", maximumFractionDigits: 1 });
  };

  if (vehicles.length === 0) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Gauge className="h-6 w-6 text-primary" />
            {t("Distribuição de Quilometragem")}
          </CardTitle>
          <CardDescription>
            {t("Veículos por faixa de quilometragem")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            {t("Nenhum veículo cadastrado")}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-medium rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl font-bold">
          <Gauge className="h-6 w-6 text-primary" />
          {t("Distribuição de Quilometragem")}
        </CardTitle>
        <CardDescription className="mt-1">
          {t("Veículos por faixa de quilometragem")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Totais */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-muted-foreground font-medium">{t("Total KM Leves")}</p>
            <p className="text-2xl font-bold text-blue-600">{formatKm(totalKmLeves)} km</p>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl">
            <p className="text-sm text-muted-foreground font-medium">{t("Total KM Pesados")}</p>
            <p className="text-2xl font-bold text-emerald-600">{formatKm(totalKmPesados)} km</p>
          </div>
        </div>

        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="range" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  t("{count} veículos", { count: value }),
                  name === 'leves' ? t('Leves') : t('Pesados')
                ]}
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' 
                }}
              />
              <Legend 
                formatter={(value) => value === 'leves' ? t('Veículos Leves') : t('Veículos Pesados')}
                iconType="circle"
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Bar 
                dataKey="leves" 
                fill="#3b82f6" 
                radius={[6, 6, 0, 0]}
                name="leves"
              />
              <Bar 
                dataKey="pesados" 
                fill="#10b981" 
                radius={[6, 6, 0, 0]}
                name="pesados"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
