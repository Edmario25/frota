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

type Departamento = Database['public']['Tables']['departamentos']['Row'];

interface ConfirmDeleteDepartamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departamento: Departamento | null;
  onConfirm: () => void;
}

export const ConfirmDeleteDepartamentoModal = ({
  open,
  onOpenChange,
  departamento,
  onConfirm,
}: ConfirmDeleteDepartamentoModalProps) => {
  if (!departamento) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o departamento <strong>{departamento.nome}</strong>?
            Esta ação não pode ser desfeita e pode afetar funcionários associados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
