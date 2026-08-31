import { useState } from "react";
import { AprEditor } from "@/components/sms/AprEditor";
import { AprPanel } from "@/components/sms/AprPanel";
import { Button } from "@/components/ui/button";
interface Props {
  employee: { id: string; nome: string };
  obraId: string;
  obras: { id: string; nome: string }[];
  tiposAtividade: { id: string; nome: string }[];
  riscosCatalogo: {
    id: string;
    risco: string;
    categoria: string;
    recomendacao: string | null;
  }[];
  onSave: (type: "apr", data: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
}
export function AprForm({ employee, obraId, obras, onSave, onBack }: Props) {
  const [history, setHistory] = useState(false);
  return (
    <div className="p-4 space-y-4 bg-white text-slate-900">
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack}>
          Voltar ao app
        </Button>
        <Button variant="outline" onClick={() => setHistory((v) => !v)}>
          {history ? "Novo rascunho" : "Consultar / ciência / liberação"}
        </Button>
      </div>
      {history ? (
        <>
          <p className="text-sm">
            Consulta, assinatura e liberação exigem conexão. Um rascunho offline
            não autoriza a atividade.
          </p>
          <AprPanel obras={obras} allowCreate={false} />
        </>
      ) : (
        <AprEditor
          obras={obras}
          initial={{ obra_id: obraId || obras[0]?.id || "" }}
          responsavel={employee.nome}
          onCancel={onBack}
          onSave={async (d) => {
            await onSave("apr", { ...d, apr_version: 2 });
          }}
        />
      )}
    </div>
  );
}
