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
import { T } from "@/i18n";

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
          <AlertDialogTitle><T>Baixar veículo da frota</T></AlertDialogTitle>
          <AlertDialogDescription>
            <T>Deseja retirar da operação o veículo</T>{" "}
            <strong>{vehicle?.placa}</strong> ({vehicle?.marca} {vehicle?.modelo})?
            <br />
            <br />
            <T>O veículo ficará inativo e será desvinculado da obra. Todo o histórico de manutenção, abastecimento, inspeções e custos será preservado para auditoria.</T>
          </AlertDialogDescription>
          <div className="space-y-2 text-left">
            <Label htmlFor="motivo-baixa-leve"><T>Motivo da baixa</T></Label>
            <Textarea id="motivo-baixa-leve" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ex.: devolução à locadora, venda, perda total ou desmobilização" rows={3} />
            <p className="text-xs text-muted-foreground"><T>Se não informar, será registrada uma baixa administrativa.</T></p>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel><T>Cancelar</T></AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => { onConfirm(motivo.trim() || undefined); setMotivo(""); }}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            <T>Confirmar baixa</T>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
