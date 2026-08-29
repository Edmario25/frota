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

export function ConfirmDeleteModal({ 
  open, 
  onOpenChange, 
  vehicle, 
  onConfirm 
}: ConfirmDeleteModalProps) {
  const [motivo, setMotivo] = useState("");
  if (!vehicle) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Baixar veículo pesado</AlertDialogTitle>
          <AlertDialogDescription>
            Deseja retirar da operação o veículo pesado <strong>{vehicle.placa}</strong> ({vehicle.marca} {vehicle.modelo})?
            <br />
            <br />
            O ativo ficará inativo e será desvinculado da obra, mas todo o histórico operacional e financeiro permanecerá disponível para auditoria.
          </AlertDialogDescription>
          <div className="space-y-2 text-left">
            <Label htmlFor="motivo-baixa-pesado">Motivo da baixa</Label>
            <Textarea id="motivo-baixa-pesado" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Ex.: devolução à locadora, venda, perda total ou desmobilização" rows={3} />
            <p className="text-xs text-muted-foreground">O motivo ficará registrado no histórico do ativo.</p>
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
}
