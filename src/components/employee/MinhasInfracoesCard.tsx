import { useEffect } from "react";
import { AlertTriangle, Check, Gauge } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMinhasInfracoes } from "@/hooks/useMinhasInfracoes";
import { cn } from "@/lib/utils";

const GRAVIDADE: Record<string, { label: string; badge: string; barra: string }> = {
  leve:       { label: "Leve",       badge: "bg-yellow-100 text-yellow-800", barra: "bg-yellow-400" },
  media:      { label: "Média",      badge: "bg-orange-100 text-orange-800", barra: "bg-orange-400" },
  grave:      { label: "Grave",      badge: "bg-red-100 text-red-700",       barra: "bg-red-500" },
  gravissima: { label: "Gravíssima", badge: "bg-red-200 text-red-900",       barra: "bg-red-600" },
};

/** Avisa uma vez por infração, mesmo que o app seja reaberto na mesma sessão. */
async function avisar(titulo: string, corpo: string, tag: string) {
  if (!("Notification" in window)) return;
  if (sessionStorage.getItem(`notif_${tag}`)) return;
  let permissao = Notification.permission;
  if (permissao === "default") permissao = await Notification.requestPermission();
  if (permissao === "granted") {
    new Notification(titulo, { body: corpo, tag, icon: "/favicon.ico" });
    sessionStorage.setItem(`notif_${tag}`, "1");
  }
}

export function MinhasInfracoesCard() {
  const { pendentes, loading, darCiencia } = useMinhasInfracoes();

  // Dispara o aviso do sistema para cada infração pendente ainda não avisada
  useEffect(() => {
    for (const i of pendentes) {
      const g = GRAVIDADE[i.gravidade]?.label ?? i.gravidade;
      avisar(
        `Excesso de velocidade — ${g}`,
        `${Math.round(i.velocidade_kmh)} km/h em zona de ${i.limite_kmh} km/h` +
          (i.checkpoint_nome ? ` no ${i.checkpoint_nome}` : "") +
          ". Abra o app para dar ciência.",
        `infracao_${i.id}`,
      );
    }
  }, [pendentes]);

  if (loading || !pendentes.length) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
          {pendentes.length === 1
            ? "Notificação de velocidade"
            : `${pendentes.length} notificações de velocidade`}
        </p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {pendentes.map(i => {
          const g = GRAVIDADE[i.gravidade] ?? GRAVIDADE.media;
          const pct = Math.min(
            (i.velocidade_kmh / Math.max(i.limite_kmh, 1)) * 100, 100
          );
          return (
            <div key={i.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", g.badge)}>
                  {g.label}
                </span>
                <span className="text-[11px] text-slate-400">
                  {format(parseISO(i.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>

              <p className="font-bold text-slate-800 dark:text-slate-100 text-[15px] leading-tight">
                {Math.round(i.velocidade_kmh)} km/h
                <span className="font-normal text-slate-500 text-sm">
                  {" "}em zona de {i.limite_kmh} km/h
                </span>
              </p>

              <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden my-2">
                <div className={cn("h-full rounded-full", g.barra)} style={{ width: `${pct}%` }} />
              </div>

              <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                <Gauge className="h-3 w-3 flex-shrink-0" />
                {[i.checkpoint_nome, i.obra_nome, i.placa].filter(Boolean).join(" · ") || "—"}
              </p>

              <button
                onClick={() => darCiencia(i.id)}
                className="w-full flex items-center justify-center gap-2 rounded-xl
                           bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900
                           text-sm font-medium py-2.5 active:scale-[0.98] transition-transform"
              >
                <Check className="h-4 w-4" />
                Estou ciente
              </button>
            </div>
          );
        })}
      </div>

      <p className="px-4 pb-3 pt-1 text-[11px] text-slate-400 leading-snug">
        Dar ciência confirma que você viu o aviso. Não é admissão de culpa —
        se discorda, procure a equipe de segurança.
      </p>
    </div>
  );
}
