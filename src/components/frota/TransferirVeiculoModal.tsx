import { useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useObras } from "@/hooks/useObras";
import type { Database } from "@/integrations/supabase/types";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onSuccess: () => void;
}

export function TransferirVeiculoModal({ open, onOpenChange, vehicle, onSuccess }: Props) {
  const { toast } = useToast();
  const { obras } = useObras();
  const [obraDestinoId, setObraDestinoId] = useState("");
  const [dataTransferencia, setDataTransferencia] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const handleTransferir = async () => {
    if (!vehicle || !obraDestinoId) return;
    setLoading(true);
    try {
      // 1. Fecha vínculo atual com a obra de origem
      await (supabase as any)
        .from("obra_veiculos")
        .update({
          status: false,
          data_saida: dataTransferencia,
          updated_at: new Date().toISOString(),
        })
        .eq("vehicle_id", vehicle.id)
        .eq("status", true);

      // 2. Cria novo vínculo com a obra destino
      const { error } = await (supabase as any)
        .from("obra_veiculos")
        .insert({
          vehicle_id: vehicle.id,
          obra_id: obraDestinoId,
          tipo_vinculo: "exclusivo",
          data_entrada: dataTransferencia,
          status: true,
        });

      if (error) throw error;

      const obraDestino = obras.find(o => o.id === obraDestinoId);
      toast({
        title: "Veículo transferido",
        description: `${vehicle.placa} transferido para ${obraDestino?.nome ?? "nova obra"} com sucesso.`,
      });

      setObraDestinoId("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erro ao transferir veículo", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  const obrasAtivas = obras.filter(o => o.status === "em_andamento" || o.status === "planejada");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            Transferir Veículo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info do veículo */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Veículo</p>
            <p className="font-bold text-foreground">{vehicle.placa}</p>
            <p className="text-sm text-muted-foreground">{vehicle.marca} {vehicle.modelo} · {vehicle.ano}</p>
          </div>

          {/* Obra destino */}
          <div className="space-y-1.5">
            <Label>Obra destino <span className="text-destructive">*</span></Label>
            <Select value={obraDestinoId} onValueChange={setObraDestinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a obra destino..." />
              </SelectTrigger>
              <SelectContent>
                {obrasAtivas.map(obra => (
                  <SelectItem key={obra.id} value={obra.id}>
                    {obra.nome}
                    {obra.codigo_interno ? ` (${obra.codigo_interno})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <Label>Data da transferência</Label>
            <Input
              type="date"
              value={dataTransferencia}
              onChange={(e) => setDataTransferencia(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O histórico na obra atual será mantido com a data de saída registrada. O veículo permanecerá <strong>Em Uso</strong> na nova obra.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransferir}
            disabled={loading || !obraDestinoId}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Transferindo...</>
              : <><ArrowLeftRight className="h-4 w-4 mr-2" />Confirmar Transferência</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
