/**
 * Manutenção do meu veículo — card do app do motorista.
 *
 * Duas perguntas, nesta ordem: posso sair com este veículo? e o que está
 * perto de vencer? A primeira vem numa faixa vermelha, porque descobrir
 * depois de carregar e sair para a obra custa a viagem inteira.
 *
 * Quando não há plano aplicado, o card diz isso em vez de ficar calado:
 * lista vazia por falta de cadastro parece veículo em dia.
 */

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificarMotorista } from "@/lib/notificar";
import {
  useMeuVeiculoManutencao,
  restanteDoVencimento,
  type VencimentoVeiculo,
} from "@/hooks/useMeuVeiculoManutencao";

export function ManutencaoVeiculoCard({
  vehicleId,
  placa,
}: { vehicleId?: string; placa?: string }) {
  const {
    vencidos, criticosVencidos, aVencer, documentosVencidos, temPlano, loading, erro,
  } = useMeuVeiculoManutencao(vehicleId);

  const impedido = criticosVencidos.length > 0 || documentosVencidos > 0;

  // Avisa na bandeja quando o veículo está impedido de sair. Um card só é visto
  // por quem abre o app; o motorista que impedir de sair precisa saber antes.
  useEffect(() => {
    if (!vehicleId || loading || !impedido) return;
    const motivo = criticosVencidos.length
      ? `${criticosVencidos[0].servico} vencida`
      : "documento vencido";
    void notificarMotorista(
      "Veículo impedido de sair",
      `${placa ?? "Seu veículo"} — ${motivo}. Procure o gestor da frota antes de usar.`,
      `bloqueio_${vehicleId}_${criticosVencidos.length}_${documentosVencidos}`,
    );
  }, [vehicleId, loading, impedido, criticosVencidos, documentosVencidos, placa]);

  if (!vehicleId || erro) return null;

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-3 h-3 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
      {impedido && (
        <div className="bg-red-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm font-bold">Não saia com este veículo</p>
          </div>
          <p className="mt-1 text-xs text-red-100">
            {criticosVencidos.length > 0 && (
              <>
                {criticosVencidos.map(v => v.servico).join(", ")}
                {criticosVencidos.length === 1 ? " está vencida" : " estão vencidas"}
                {documentosVencidos > 0 && " e "}
              </>
            )}
            {documentosVencidos > 0 && (
              <>
                {documentosVencidos === 1
                  ? "há 1 documento vencido"
                  : `há ${documentosVencidos} documentos vencidos`}
              </>
            )}
            . Procure o gestor da frota antes de usar.
          </p>
        </div>
      )}

      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
          Manutenção do veículo
        </p>
        {temPlano && !vencidos.length && !aVencer.length && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
      </div>

      {!temPlano ? (
        <p className="px-4 py-4 text-xs text-slate-500">
          Nenhum plano de manutenção aplicado a este veículo. Isso não quer dizer
          que ele está em dia — quer dizer que ninguém definiu o que acompanhar.
          Avise o gestor da frota.
        </p>
      ) : !vencidos.length && !aVencer.length ? (
        <p className="px-4 py-4 text-xs text-slate-500">
          Nenhum serviço vencido ou próximo do vencimento.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {[...vencidos, ...aVencer].slice(0, 5).map(v => (
            <LinhaVencimento key={v.item_id} v={v} />
          ))}
        </div>
      )}

      {documentosVencidos > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-700">
          <FileWarning className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
          <p className="text-xs font-medium text-red-600">
            {documentosVencidos === 1
              ? "1 documento do veículo vencido"
              : `${documentosVencidos} documentos do veículo vencidos`}
          </p>
        </div>
      )}
    </div>
  );
}

function LinhaVencimento({ v }: { v: VencimentoVeiculo }) {
  const vencida = v.situacao === "vencida";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={cn(
        "h-2 w-2 flex-shrink-0 rounded-full",
        vencida ? "bg-red-500" : v.bloqueia_veiculo ? "bg-orange-500" : "bg-amber-400",
      )} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {v.servico}
          {v.bloqueia_veiculo && (
            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-red-500" />
          )}
        </p>
      </div>
      <span className={cn(
        "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        vencida
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      )}>
        {restanteDoVencimento(v)}
      </span>
    </div>
  );
}
