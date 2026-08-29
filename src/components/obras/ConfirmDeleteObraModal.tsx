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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface ConfirmDeleteObraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  obraNome: string;
}

export function ConfirmDeleteObraModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  obraNome 
}: ConfirmDeleteObraModalProps) {
  const [motivo, setMotivo] = useState("");
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar obra concluída</AlertDialogTitle>
          <AlertDialogDescription>
            A obra "{obraNome}" sairá da operação, mas todos os registros técnicos, financeiros e trabalhistas serão preservados. Somente obras concluídas e sem pendências podem ser arquivadas.
          </AlertDialogDescription>
          <div className="space-y-2 text-left"><Label htmlFor="motivo-arquivo-obra">Motivo do arquivamento *</Label><Textarea id="motivo-arquivo-obra" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: contrato encerrado e desmobilização concluída" rows={3}/></div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={motivo.trim().length < 5} onClick={() => { onConfirm(motivo.trim()); setMotivo(""); }} className="bg-amber-600 text-white hover:bg-amber-700">
            Arquivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
