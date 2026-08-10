import { useState } from "react";
import { Wind, Check, Loader2 } from "lucide-react";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useSmokeTests } from "@/hooks/useSmokeTests";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MobilePhotoCapture } from "@/components/app/MobilePhotoCapture";

const RINGELMANN = [
  { valor: 0, label: "0 – Transparente",  cor: "bg-gray-100 border-gray-300 text-gray-600",     resultado: "aprovado" },
  { valor: 1, label: "1 – Levemente cinza", cor: "bg-gray-200 border-gray-400 text-gray-700",   resultado: "aprovado" },
  { valor: 2, label: "2 – Cinza",           cor: "bg-gray-400 border-gray-500 text-white",      resultado: "aprovado" },
  { valor: 3, label: "3 – Cinza escuro",    cor: "bg-gray-600 border-gray-700 text-white",      resultado: "aprovado" },
  { valor: 4, label: "4 – Preto acinzentado", cor: "bg-gray-800 border-gray-900 text-white",   resultado: "reprovado" },
  { valor: 5, label: "5 – Preto opaco",     cor: "bg-black border-black text-white",            resultado: "reprovado" },
];

export function AppFumaca() {
  const { vehicle, loading: vLoading } = useEmployeeVehicle();
  const { employee } = useCurrentEmployee();
  const { createSmokeTest } = useSmokeTests();
  const { toast } = useToast();

  const [indice, setIndice]   = useState<number | null>(null);
  const [obs, setObs]         = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState<"aprovado" | "reprovado" | null>(null);

  const selected = indice !== null ? RINGELMANN[indice] : null;

  const handleSubmit = async () => {
    if (indice === null) { toast({ title: "Selecione o índice Ringelmann", variant: "destructive" }); return; }
    if (!vehicle) return;
    setSaving(true);
    try {
      await createSmokeTest({
        vehicle_id: vehicle.id,
        employee_id: employee?.id ?? null,
        indice_ringelmann: indice,
        data_teste: new Date().toISOString().split("T")[0],
        observacoes: obs || null,
        evidencias_url: fotoUrl || null,
      } as any);
      setDone(selected!.resultado as "aprovado" | "reprovado");
      setFotoUrl("");
      toast({ title: "Teste de fumaça registrado!" });
    } catch { } finally { setSaving(false); }
  };

  if (vLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <Wind className="h-12 w-12 text-slate-300 mb-3" />
        <p className="text-slate-500 text-sm">Nenhum veículo atribuído.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center h-[70vh] px-6 text-center gap-4",
      )}>
        <div className={cn(
          "h-24 w-24 rounded-full flex items-center justify-center text-4xl",
          done === "aprovado" ? "bg-green-100" : "bg-red-100"
        )}>
          {done === "aprovado" ? "✅" : "❌"}
        </div>
        <div>
          <h2 className={cn(
            "text-2xl font-extrabold",
            done === "aprovado" ? "text-green-700" : "text-red-700"
          )}>
            {done === "aprovado" ? "APROVADO" : "REPROVADO"}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Índice Ringelmann {indice} · {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>
        <button
          onClick={() => { setIndice(null); setObs(""); setFotoUrl(""); setDone(null); }}
          className="mt-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl text-sm"
        >
          Novo Teste
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-800 to-teal-600 px-4 pt-10 pb-5 text-white">
        <h1 className="text-lg font-bold">Teste de Fumaça</h1>
        <p className="text-teal-200 text-sm">{vehicle.placa} · {vehicle.marca} {vehicle.modelo}</p>
        <p className="text-teal-300 text-xs mt-0.5">Escala Ringelmann (0–5)</p>
      </div>

      <div className="p-4 space-y-4 pb-8">
        {/* Resultado preview */}
        {selected && (
          <div className={cn(
            "rounded-2xl p-4 flex items-center gap-3 border-2 transition-all",
            selected.resultado === "aprovado"
              ? "bg-green-50 border-green-300"
              : "bg-red-50 border-red-300"
          )}>
            <div className="text-3xl">{selected.resultado === "aprovado" ? "✅" : "❌"}</div>
            <div>
              <p className={cn("font-bold text-lg", selected.resultado === "aprovado" ? "text-green-700" : "text-red-700")}>
                {selected.resultado.toUpperCase()}
              </p>
              <p className="text-sm text-slate-500">
                Índice {indice} — {selected.label.split(" – ")[1]}
                {" · "}Densidade {indice! * 20}%
              </p>
            </div>
          </div>
        )}

        {/* Escala Ringelmann */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Selecione o Índice</p>
          </div>
          <div className="p-3 space-y-2">
            {RINGELMANN.map(r => (
              <button
                key={r.valor}
                onClick={() => setIndice(r.valor)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                  indice === r.valor
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-transparent bg-slate-50 dark:bg-slate-700"
                )}
              >
                <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center font-bold text-sm flex-shrink-0", r.cor)}>
                  {r.valor}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.label}</p>
                  <p className="text-xs text-slate-400">Densidade: {r.valor * 20}%</p>
                </div>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                  r.resultado === "aprovado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}>
                  {r.resultado === "aprovado" ? "Aprovado" : "Reprovado"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Observações</label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Condições do teste, clima, etc..."
            rows={3}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        </div>

        {/* Foto da evidência */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <MobilePhotoCapture
            label="📷 Foto da fumaça / evidência (opcional)"
            bucket="smoke-photos"
            vehicleId={vehicle.id}
            value={fotoUrl}
            onChange={setFotoUrl}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || indice === null}
          className="w-full h-14 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-base transition-colors"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          {saving ? "Registrando..." : "Registrar Teste"}
        </button>
      </div>
    </div>
  );
}
