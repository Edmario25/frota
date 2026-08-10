import { useState } from "react";
import { Check, X, Minus, ClipboardCheck, Loader2, Camera } from "lucide-react";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useInspectionChecklist } from "@/hooks/useInspectionChecklist";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MobilePhotoCapture } from "@/components/app/MobilePhotoCapture";

type ItemStatus = "ok" | "defeito" | "na";

interface CheckItem {
  id: string;
  label: string;
  categoria: string;
}

const ITEMS: CheckItem[] = [
  { id: "pneus",        label: "Pneus (pressão e estado)",     categoria: "Mecânica"   },
  { id: "oleo",         label: "Nível de óleo do motor",       categoria: "Mecânica"   },
  { id: "agua",         label: "Água do radiador",             categoria: "Mecânica"   },
  { id: "freios",       label: "Freios",                       categoria: "Mecânica"   },
  { id: "embreagem",    label: "Embreagem",                    categoria: "Mecânica"   },
  { id: "combustivel",  label: "Nível de combustível",         categoria: "Mecânica"   },
  { id: "farois",       label: "Faróis e lanternas",           categoria: "Elétrica"   },
  { id: "setas",        label: "Setas e pisca-alerta",         categoria: "Elétrica"   },
  { id: "limpadores",   label: "Limpadores de para-brisa",     categoria: "Elétrica"   },
  { id: "buzina",       label: "Buzina",                       categoria: "Elétrica"   },
  { id: "retrovisores", label: "Retrovisores",                 categoria: "Segurança"  },
  { id: "extintor",     label: "Extintor de incêndio",         categoria: "Segurança"  },
  { id: "cinto",        label: "Cinto de segurança",           categoria: "Segurança"  },
  { id: "triangulo",    label: "Triângulo de segurança",       categoria: "Segurança"  },
  { id: "documentos",   label: "Documentação do veículo",      categoria: "Documentos" },
];

const categorias = [...new Set(ITEMS.map(i => i.categoria))];

// As mesmas 5 categorias de foto usadas no sistema gerencial
const FOTOS_CONFIG = [
  { key: "frente",        label: "Foto 1 — Frente",        icon: "🚗" },
  { key: "traseira",      label: "Foto 2 — Traseira",      icon: "🚙" },
  { key: "lado_direito",  label: "Foto 3 — Lado Direito",  icon: "➡️" },
  { key: "lado_esquerdo", label: "Foto 4 — Lado Esquerdo", icon: "⬅️" },
  { key: "painel",        label: "Foto 5 — Painel",        icon: "📊" },
] as const;

type FotoKey = (typeof FOTOS_CONFIG)[number]["key"];
type FotosState = Record<FotoKey, string>;

const FOTOS_INICIAL: FotosState = {
  frente:        "",
  traseira:      "",
  lado_direito:  "",
  lado_esquerdo: "",
  painel:        "",
};

export function AppChecklist() {
  const { vehicle, loading: vLoading } = useEmployeeVehicle();
  const { employee, loading: eLoading } = useCurrentEmployee();
  const { createChecklist, createChecklistItem } = useInspectionChecklist();
  const { toast } = useToast();

  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [km,    setKm]    = useState("");
  const [obs,   setObs]   = useState("");
  const [fotos, setFotos] = useState<FotosState>({ ...FOTOS_INICIAL });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const setStatus = (id: string, status: ItemStatus) =>
    setStatuses(prev => ({ ...prev, [id]: status }));

  const setFoto = (key: FotoKey, url: string) =>
    setFotos(prev => ({ ...prev, [key]: url }));

  const resetForm = () => {
    setStatuses({});
    setKm("");
    setObs("");
    setFotos({ ...FOTOS_INICIAL });
    setDone(false);
  };

  const pendentes = ITEMS.filter(i => !statuses[i.id]);
  const progresso = Math.round(((ITEMS.length - pendentes.length) / ITEMS.length) * 100);

  // Quantas fotos já foram capturadas
  const fotosCapturadas = Object.values(fotos).filter(Boolean).length;

  const handleSubmit = async () => {
    if (pendentes.length > 0) {
      toast({
        title: `Responda todos os itens (${pendentes.length} restante${pendentes.length > 1 ? "s" : ""})`,
        variant: "destructive",
      });
      return;
    }
    if (!vehicle || !employee) return;

    setSaving(true);
    try {
      // Só serializa fotos_checklist se pelo menos uma foi capturada
      const temFotos = Object.values(fotos).some(Boolean);
      const fotosJson = temFotos ? JSON.stringify(fotos) : null;

      const checklist = await createChecklist({
        vehicle_id:      vehicle.id,
        employee_id:     employee.id,
        tipo_servico:    "pre_viagem",
        km_atual:        km ? parseFloat(km) : null,
        observacoes:     obs || null,
        foto_url:        fotos.frente || null,  // retro-compat: frente = foto principal
        fotos_checklist: fotosJson,
      });

      await Promise.all(
        ITEMS.map(item =>
          createChecklistItem({
            checklist_id: checklist.id,
            item_nome:    item.label,
            status:
              statuses[item.id] === "ok"
                ? "aprovado"
                : statuses[item.id] === "defeito"
                  ? "reprovado"
                  : "nao_aplicavel",
          })
        )
      );

      setDone(true);
      toast({ title: "Checklist enviado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar checklist", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Estados de carregamento / sem veículo ────────────────────────────────────

  if (vLoading || eLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <ClipboardCheck className="h-12 w-12 text-slate-300 mb-3" />
        <p className="text-slate-500 text-sm">Nenhum veículo atribuído.</p>
      </div>
    );
  }

  // ── Tela de sucesso ──────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] px-6 text-center gap-4">
        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Checklist enviado!</h2>
          <p className="text-slate-500 text-sm mt-1">
            {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>
        <button
          onClick={resetForm}
          className="mt-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm"
        >
          Novo Checklist
        </button>
      </div>
    );
  }

  // ── Formulário principal ─────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">

      {/* Header */}
      <div className="bg-gradient-to-br from-violet-800 to-violet-600 px-4 pt-10 pb-5 text-white">
        <h1 className="text-lg font-bold">Checklist de Inspeção</h1>
        <p className="text-violet-200 text-sm">{vehicle.placa} · {vehicle.marca} {vehicle.modelo}</p>
        <p className="text-violet-300 text-xs mt-0.5">{format(new Date(), "dd/MM/yyyy", { locale: ptBR })}</p>
      </div>

      {/* Progress bar */}
      <div className="bg-violet-700 px-4 pb-3">
        <div className="flex items-center justify-between text-xs text-violet-200 mb-1">
          <span>{ITEMS.length - pendentes.length} de {ITEMS.length} itens</span>
          <span>{progresso}%</span>
        </div>
        <div className="h-2 bg-violet-900/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 rounded-full transition-all duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>
      </div>

      <div className="p-4 space-y-4 pb-8">

        {/* KM */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
            KM Atual do Veículo
          </label>
          <input
            type="number"
            value={km}
            onChange={e => setKm(e.target.value)}
            placeholder="Informe a quilometragem"
            className="w-full h-12 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Itens por categoria */}
        {categorias.map(cat => (
          <div key={cat} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{cat}</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {ITEMS.filter(i => i.categoria === cat).map(item => {
                const s = statuses[item.id];
                return (
                  <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                    <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{item.label}</p>
                    <div className="flex gap-1.5">
                      <StatusBtn
                        active={s === "ok"}
                        onClick={() => setStatus(item.id, s === "ok" ? undefined as any : "ok")}
                        color="bg-green-500"
                        icon={<Check className="h-3.5 w-3.5" />}
                        label="OK"
                      />
                      <StatusBtn
                        active={s === "defeito"}
                        onClick={() => setStatus(item.id, s === "defeito" ? undefined as any : "defeito")}
                        color="bg-red-500"
                        icon={<X className="h-3.5 w-3.5" />}
                        label="Def."
                      />
                      <StatusBtn
                        active={s === "na"}
                        onClick={() => setStatus(item.id, s === "na" ? undefined as any : "na")}
                        color="bg-slate-400"
                        icon={<Minus className="h-3.5 w-3.5" />}
                        label="N/A"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Observações */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
            Observações Gerais
          </label>
          <textarea
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Alguma observação adicional..."
            rows={3}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
          />
        </div>

        {/* ── 5 Fotos do veículo ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Header da seção com contador */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-violet-600" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Fotos do Veículo
              </p>
            </div>
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full",
              fotosCapturadas === 5
                ? "bg-green-100 text-green-700"
                : fotosCapturadas > 0
                  ? "bg-violet-100 text-violet-700"
                  : "bg-slate-100 text-slate-500"
            )}>
              {fotosCapturadas}/5 fotos
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {FOTOS_CONFIG.map(({ key, label, icon }) => (
              <div key={key} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{icon}</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {label}
                  </span>
                  {fotos[key] && (
                    <span className="ml-auto text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      ✓ capturada
                    </span>
                  )}
                </div>
                <MobilePhotoCapture
                  label=""
                  bucket="vehicle-photos"
                  vehicleId={vehicle.id}
                  value={fotos[key]}
                  onChange={url => setFoto(key, url)}
                />
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-slate-50/50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-600">
            <p className="text-[10px] text-slate-400 text-center">
              Fotos opcionais — mesmas categorias visíveis no sistema gerencial
            </p>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full h-14 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-base transition-colors"
        >
          {saving
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <ClipboardCheck className="h-5 w-5" />
          }
          {saving ? "Enviando..." : "Enviar Checklist"}
        </button>
      </div>
    </div>
  );
}

function StatusBtn({
  active, onClick, color, icon, label,
}: {
  active: boolean; onClick: () => void; color: string; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center h-10 w-10 rounded-lg text-[9px] font-semibold transition-all",
        active
          ? cn(color, "text-white scale-105 shadow-sm")
          : "bg-slate-100 dark:bg-slate-600 text-slate-400 dark:text-slate-300"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
