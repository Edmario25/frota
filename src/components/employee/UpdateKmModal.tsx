import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UpdateKmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: { id: string; marca: string; modelo: string; placa: string; quilometragem_atual: number } | null;
  onKmUpdated?: () => void;
}

export const UpdateKmModal = ({ open, onOpenChange, vehicle, onKmUpdated }: UpdateKmModalProps) => {
  const { toast } = useToast();
  const [newKm, setNewKm] = useState(0);
  const [loading, setLoading] = useState(false);

  // Sincronizar com km atual ao abrir
  useEffect(() => {
    if (open && vehicle) {
      setNewKm(vehicle.quilometragem_atual ?? 0);
    }
  }, [open, vehicle]);

  const handleSubmit = async () => {
    if (!vehicle) return;
    if (newKm < vehicle.quilometragem_atual) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ quilometragem_atual: newKm })
        .eq("id", vehicle.id);

      if (error) throw error;

      toast({
        title: "Quilometragem atualizada",
        description: `Novo km: ${newKm.toLocaleString()} km`,
      });

      onOpenChange(false);
      onKmUpdated?.();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const kmAtual = vehicle?.quilometragem_atual ?? 0;
  const invalido = newKm < kmAtual;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar Quilometragem</DialogTitle>
          <DialogDescription>
            {vehicle
              ? `${vehicle.marca} ${vehicle.modelo} — ${vehicle.placa}`
              : "Veículo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Quilometragem Atual</Label>
            <Input
              type="number"
              value={kmAtual}
              disabled
              className="bg-muted mt-1"
            />
          </div>

          <div>
            <Label htmlFor="new-km">Nova Quilometragem</Label>
            <Input
              id="new-km"
              type="number"
              value={newKm}
              onChange={(e) => setNewKm(Number(e.target.value))}
              min={kmAtual}
              className="mt-1"
              placeholder="Informe a nova quilometragem"
            />
            {invalido && (
              <p className="text-sm text-destructive mt-1">
                O novo km não pode ser menor que o atual ({kmAtual.toLocaleString()} km)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || invalido || !vehicle}>
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
