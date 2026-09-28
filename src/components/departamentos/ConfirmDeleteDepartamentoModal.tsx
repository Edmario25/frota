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
import { T } from "@/i18n";

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
          <AlertDialogTitle><T>Confirmar Exclusão</T></AlertDialogTitle>
          <AlertDialogDescription>
            <T>Tem certeza que deseja excluir o departamento</T> <strong>{departamento.nome}</strong>?{' '}
            <T>Esta ação não pode ser desfeita e pode afetar funcionários associados.</T>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel><T>Cancelar</T></AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <T>Excluir</T>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
