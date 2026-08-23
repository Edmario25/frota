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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

type Employee = Database['public']['Tables']['employees']['Row'];

interface ConfirmDeleteEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  onConfirm: (date: string, reason: string) => void;
}

export const ConfirmDeleteEmployeeModal = ({ 
  open, 
  onOpenChange, 
  employee, 
  onConfirm 
}: ConfirmDeleteEmployeeModalProps) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10));
      setReason("");
    }
  }, [open]);

  if (!employee) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar desligamento</AlertDialogTitle>
          <AlertDialogDescription>
            O funcionário <strong>{employee.nome}</strong> será inativado e perderá o acesso ao sistema.
            O histórico profissional será preservado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="termination-date">Data do desligamento</Label>
            <Input id="termination-date" type="date" value={date} onChange={event => setDate(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="termination-reason">Motivo</Label>
            <Textarea
              id="termination-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Informe o motivo do desligamento"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => onConfirm(date, reason.trim())}
            disabled={!date || reason.trim().length < 3}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Confirmar desligamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
