import { Link } from "react-router-dom";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describePermission } from "@/lib/accessMap";

/** Tela de acesso negado: diz qual permissão falta, em vez de redirecionar em silêncio. */
export function AcessoNegado({ permission }: { permission?: string }) {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center space-y-3">
        <ShieldX className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Você não tem acesso a esta página</h1>
        <p className="text-sm text-muted-foreground">
          {permission
            ? <>É necessária a permissão <b>{describePermission(permission)}</b>. Peça ao administrador do sistema para incluí-la no seu perfil de acesso.</>
            : "Peça ao administrador do sistema para revisar o seu perfil de acesso."}
        </p>
        <Button asChild variant="outline"><Link to="/">Voltar ao início</Link></Button>
      </div>
    </div>
  );
}
