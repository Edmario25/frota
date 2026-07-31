import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVehicles } from "@/hooks/useVehicles";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface ChartData {
  name: string;
  value: number;
  color: string;
}

export function VehicleStatusChart() {
  const { vehicles, getVehicleStats } = useVehicles();
  const [chartData, setChartData] = useState<ChartData[]>([]);

  useEffect(() => {
    const loadStats = async () => {
      const stats = await getVehicleStats();
      const data: ChartData[] = [
        { name: "Disponíveis", value: stats.disponivel, color: "#10b981" },
        { name: "Em Uso", value: stats.em_uso, color: "#3b82f6" },
        { name: "Manutenção", value: stats.manutencao, color: "#f59e0b" },
      ].filter(item => item.value > 0);

      setChartData(data);
    };

    if (vehicles.length > 0) {
      loadStats();
    }
  }, [vehicles, getVehicleStats]);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (chartData.length === 0) {
    return (
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <Activity className="h-6 w-6 text-primary" />
            Status da Frota
          </CardTitle>
          <CardDescription>
            Distribuição atual dos veículos por status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum veículo cadastrado
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
              <Activity className="h-6 w-6 text-primary" />
              Status da Frota
            </CardTitle>
            <CardDescription className="mt-1">
              Distribuição atual dos veículos por status
            </CardDescription>
          </div>
          <span className="text-sm font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            {total} veículos
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                innerRadius={50}
                fill="#8884d8"
                dataKey="value"
                paddingAngle={3}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`${value} veículos`, '']} 
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' 
                }}
              />
              <Legend 
                iconType="circle"
                wrapperStyle={{ paddingTop: '20px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
