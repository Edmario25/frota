import { useState } from "react";
import { LogOut, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onSuccess: () => void;
}

export function DevolverVeiculoModal({ open, onOpenChange, vehicle, onSuccess }: Props) {
  const { toast } = useToast();
  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const handleDevolver = async () => {
    if (!vehicle) return;
    setLoading(true);
    try {
      // 1. Encerra o vínculo com a obra (fecha o registro ativo)
      await (supabase as any)
        .from("obra_veiculos")
        .update({ status: false, data_saida: dataDevolucao, updated_at: new Date().toISOString() })
        .eq("vehicle_id", vehicle.id)
        .eq("status", true);

      // 2. Fecha ciclo de KM ativo (se houver)
      await (supabase as any)
        .from("vehicle_km_cycles")
        .update({ status: "encerrado" })
        .eq("vehicle_id", vehicle.id)
        .eq("status", "ativo");

      // 3. Marca o veículo como inativo (stop custo mensal)
      const { error } = await supabase
        .from("vehicles")
        .update({ status: "inativo" })
        .eq("id", vehicle.id);

      if (error) throw error;

      toast({
        title: "Veículo devolvido",
        description: `${vehicle.placa} devolvido em ${new Date(dataDevolucao + "T12:00:00").toLocaleDateString("pt-BR")}. Custo mensal encerrado.`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erro ao devolver veículo", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-600" />
            Devolver Veículo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alerta */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Devolução de veículo locado</p>
              <p className="mt-1">O veículo será marcado como <strong>inativo</strong>, o custo mensal será encerrado e o vínculo com a obra será fechado. O histórico será mantido.</p>
            </div>
          </div>

          {/* Info do veículo */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Veículo</p>
            <p className="font-bold text-foreground">{vehicle.placa}</p>
            <p className="text-sm text-muted-foreground">{vehicle.marca} {vehicle.modelo} · {vehicle.ano}</p>
            {vehicle.valor_aluguel_mensal && (
              <p className="text-sm text-muted-foreground mt-1">
                Custo mensal: <span className="font-medium text-foreground">
                  {vehicle.valor_aluguel_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </p>
            )}
          </div>

          {/* Data de devolução */}
          <div className="space-y-1.5">
            <Label>Data de devolução</Label>
            <Input
              type="date"
              value={dataDevolucao}
              onChange={(e) => setDataDevolucao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="default"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleDevolver}
            disabled={loading}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Devolvendo...</> : <><LogOut className="h-4 w-4 mr-2" />Confirmar Devolução</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
