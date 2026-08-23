import React from "react";
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

interface ConfirmDeleteFornecedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fornecedorName: string;
}

export const ConfirmDeleteFornecedorModal: React.FC<ConfirmDeleteFornecedorModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  fornecedorName,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Inativar fornecedor</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja inativar o fornecedor <strong>"{fornecedorName}"</strong>?
            <br /><br />
            O histórico e os vínculos com obras serão preservados. O fornecedor deixará de aparecer nas seleções operacionais de fornecedores ativos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Inativar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
