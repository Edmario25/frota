import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

type Vehicle = Database['public']['Tables']['vehicles']['Row'];

interface ConfirmDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onConfirm: (motivo?: string) => void;
}

export const ConfirmDeleteModal = ({ open, onOpenChange, vehicle, onConfirm }: ConfirmDeleteModalProps) => {
  const [motivo, setMotivo] = useState("");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Baixar veículo da frota</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja retirar da operação o veículo{" "}
            <strong>{vehicle?.placa}</strong> ({vehicle?.marca} {vehicle?.modelo})?
            <br />
            <br />
            O veículo ficará inativo e será desvinculado da obra. Todo o histórico de manutenção, abastecimento, inspeções e custos será preservado para auditoria.
          </AlertDialogDescription>
          <div className="space-y-2 text-left">
            <Label htmlFor="motivo-baixa-leve">Motivo da baixa</Label>
            <Textarea id="motivo-baixa-leve" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ex.: devolução à locadora, venda, perda total ou desmobilização" rows={3} />
            <p className="text-xs text-muted-foreground">Se não informar, será registrada uma baixa administrativa.</p>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => { onConfirm(motivo.trim() || undefined); setMotivo(""); }}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            Confirmar baixa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
