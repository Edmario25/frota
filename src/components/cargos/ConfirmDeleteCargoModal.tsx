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

type Cargo = Database['public']['Tables']['cargos']['Row'];

interface ConfirmDeleteCargoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo: Cargo | null;
  onConfirm: () => void;
}

export const ConfirmDeleteCargoModal = ({ 
  open, 
  onOpenChange, 
  cargo, 
  onConfirm 
}: ConfirmDeleteCargoModalProps) => {
  if (!cargo) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle><T>Confirmar Exclusão</T></AlertDialogTitle>
          <AlertDialogDescription>
            <T>Tem certeza que deseja excluir o cargo</T> <strong>{cargo.nome}</strong>? {" "}
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
