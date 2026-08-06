import { useState } from "react";
import {
  Fuel, Wrench, Truck, Droplets, AlertTriangle, ShieldAlert,
  ChevronLeft, Check, WifiOff,
} from "lucide-react";
import { useEmployeeVehicle } from "@/hooks/useEmployeeVehicle";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useFuelLogs } from "@/hooks/useFuelLogs";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useTireServices } from "@/hooks/useTireServices";
import { useWashRecords } from "@/hooks/useWashRecords";
import { useTrafficFines } from "@/hooks/useTrafficFines";
import { useDamageReports } from "@/hooks/useDamageReports";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { enqueue } from "@/lib/offlineQueue";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type LancarType = "abastecimento" | "manutencao" | "borracharia" | "lavagem" | "multa" | "avaria" | null;

const opcoes = [
  { id: "abastecimento", label: "Abastecimento", Icon: Fuel,          color: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-600" },
  { id: "manutencao",   label: "Manutenção",     Icon: Wrench,        color: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600" },
  { id: "borracharia",  label: "Borracharia",    Icon: Truck,         color: "bg-orange-500", bg: "bg-orange-50",                     text: "text-orange-600" },
  { id: "lavagem",      label: "Lavagem",        Icon: Droplets,      color: "bg-teal-500",   bg: "bg-teal-50",                       text: "text-teal-600" },
  { id: "multa",        label: "Multa",          Icon: AlertTriangle, color: "bg-red-500",    bg: "bg-red-50",                        text: "text-red-600" },
  { id: "avaria",       label: "Avaria",         Icon: ShieldAlert,   color: "bg-yellow-500", bg: "bg-yellow-50",                     text: "text-yellow-600" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function MobileInput({ label, type = "text", value, onChange, placeholder, min, step, prefix }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; min?: string; step?: string; prefix?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          step={step}
          className={cn(
            "w-full h-12 border border-slate-200 dark:border-slate-600 rounded-xl",
            "bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100",
            "text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition",
            prefix ? "pl-10 pr-4" : "px-4"
          )}
        />
      </div>
    </div>
  );
}

function MobileSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-12 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Selecione...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function MobileTextarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

function SubmitButton({ label, onSave, saving, offline }: { label: string; onSave: () => void; saving: boolean; offline?: boolean }) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className={cn(
        "w-full h-12 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors",
        offline
          ? "bg-amber-500 hover:bg-amber-600 text-white"
          : "bg-blue-600 hover:bg-blue-700 text-white",
        saving && "opacity-60"
      )}
    >
      {saving ? (
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : offline ? (
        <WifiOff className="h-5 w-5" />
      ) : (
        <Check className="h-5 w-5" />
      )}
      {saving ? "Salvando..." : offline ? "Salvar offline (sincronizar depois)" : label}
    </button>
  );
}

// ── Sub-forms ──────────────────────────────────────────────────────────────────
function FormAbastecimento({ vehicleId, employeeId, onClose }: { vehicleId: string; employeeId: string; onClose: () => void }) {
  const { createFuelLog } = useFuelLogs();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [litros, setLitros]         = useState("");
  const [valorLitro, setValorLitro] = useState("");
  const [km, setKm]                 = useState("");
  const [tipo, setTipo]             = useState("");
  const [posto, setPosto]           = useState("");
  const [obs, setObs]               = useState("");
  const [saving, setSaving]         = useState(false);

  const total = litros && valorLitro
    ? (parseFloat(litros) * parseFloat(valorLitro)).toFixed(2)
    : null;

  const handleSave = async () => {
    if (!litros || !valorLitro) { toast({ title: "Preencha litros e valor/litro", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      litros: parseFloat(litros),
      valor_litro: parseFloat(valorLitro),
      km_no_abastecimento: km ? parseFloat(km) : null,
      tipo_combustivel: tipo || null,
      posto_nome: posto || null,
      observacoes: obs || null,
      created_by: employeeId,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "fuel_logs", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createFuelLog(payload);
      onClose();
    } catch { /* toast handled by hook */ } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MobileInput label="Litros" type="number" value={litros} onChange={setLitros} placeholder="0.00" step="0.01" />
        <MobileInput label="Valor/litro" type="number" value={valorLitro} onChange={setValorLitro} placeholder="0.00" step="0.01" prefix="R$" />
      </div>
      {total && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-700 dark:text-blue-300">Total</span>
          <span className="font-bold text-blue-800 dark:text-blue-200">R$ {total}</span>
        </div>
      )}
      <MobileInput label="KM atual" type="number" value={km} onChange={setKm} placeholder="KM do veículo" />
      <MobileSelect label="Tipo de combustível" value={tipo} onChange={setTipo} options={[
        { value: "gasolina", label: "Gasolina" },
        { value: "etanol", label: "Etanol" },
        { value: "diesel", label: "Diesel" },
        { value: "diesel_s10", label: "Diesel S10" },
        { value: "gnv", label: "GNV" },
      ]} />
      <MobileInput label="Nome do posto" type="text" value={posto} onChange={setPosto} placeholder="Ex: Posto Shell" />
      <MobileTextarea label="Observações" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Abastecimento" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

function FormManutencao({ vehicleId, employeeId, km, onClose }: { vehicleId: string; employeeId: string; km: number | null; onClose: () => void }) {
  const { createMaintenanceRecord } = useMaintenance();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [tipo, setTipo]           = useState<"preventiva" | "corretiva" | "emergencial" | "">("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor]         = useState("");
  const [obs, setObs]             = useState("");
  const [saving, setSaving]       = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const handleSave = async () => {
    if (!tipo) { toast({ title: "Selecione o tipo de manutenção", variant: "destructive" }); return; }
    if (!descricao) { toast({ title: "Descreva o serviço realizado", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      tipo,
      descricao,
      custo: valor ? parseFloat(valor) : null,
      quilometragem: km ?? undefined,
      status: "concluida",
      data_agendada: today,
      data_realizada: today,
      responsavel: employeeId,
      observacoes: obs || null,
      created_by: employeeId,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "maintenance_records", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createMaintenanceRecord(payload as any);
      onClose();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <MobileSelect label="Tipo de manutenção" value={tipo} onChange={v => setTipo(v as any)} options={[
        { value: "preventiva",  label: "Preventiva" },
        { value: "corretiva",   label: "Corretiva" },
        { value: "emergencial", label: "Emergencial" },
      ]} />
      <MobileTextarea label="Descrição do serviço *" value={descricao} onChange={setDescricao} placeholder="Descreva o serviço realizado..." />
      <MobileInput label="Valor (R$)" type="number" value={valor} onChange={setValor} placeholder="0,00" step="0.01" prefix="R$" />
      <MobileTextarea label="Observações" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Manutenção" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

function FormBorracharia({ vehicleId, employeeId, onClose }: { vehicleId: string; employeeId: string; onClose: () => void }) {
  const { createTireService } = useTireServices();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [tipo, setTipo]     = useState("");
  const [qtd, setQtd]       = useState("1");
  const [valor, setValor]   = useState("");
  const [local, setLocal]   = useState("");
  const [obs, setObs]       = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!tipo) { toast({ title: "Selecione o tipo de serviço", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      employee_id: employeeId,
      data_servico: new Date().toISOString().split("T")[0],
      tipo_servico: tipo,
      quantidade_pneus: parseInt(qtd),
      valor_servico: valor ? parseFloat(valor) : null,
      local_servico: local || null,
      observacoes: obs || null,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "tire_services", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createTireService(payload as any);
      onClose();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <MobileSelect label="Tipo de serviço" value={tipo} onChange={setTipo} options={[
        { value: "calibragem",  label: "Calibragem" },
        { value: "troca_pneu",  label: "Troca de pneu" },
        { value: "reparo",      label: "Reparo" },
        { value: "rodizio",     label: "Rodízio" },
      ]} />
      <MobileInput label="Quantidade de pneus" type="number" value={qtd} onChange={setQtd} min="1" />
      <MobileInput label="Valor (R$)" type="number" value={valor} onChange={setValor} placeholder="0,00" step="0.01" prefix="R$" />
      <MobileInput label="Local / Borracharia" type="text" value={local} onChange={setLocal} placeholder="Nome do estabelecimento" />
      <MobileTextarea label="Observações" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Borracharia" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

function FormLavagem({ vehicleId, employeeId, onClose }: { vehicleId: string; employeeId: string; onClose: () => void }) {
  const { createWashRecord } = useWashRecords();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [tipo, setTipo]     = useState("");
  const [valor, setValor]   = useState("");
  const [local, setLocal]   = useState("");
  const [obs, setObs]       = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!tipo) { toast({ title: "Selecione o tipo de lavagem", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      employee_id: employeeId,
      data_lavagem: new Date().toISOString().split("T")[0],
      tipo_lavagem: tipo,
      valor: valor ? parseFloat(valor) : null,
      fornecedor: local || null,
      observacoes: obs || null,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "wash_records", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createWashRecord(payload);
      onClose();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <MobileSelect label="Tipo de lavagem" value={tipo} onChange={setTipo} options={[
        { value: "simples",   label: "Simples" },
        { value: "completa",  label: "Completa" },
        { value: "polimento", label: "Polimento" },
        { value: "higienizacao", label: "Higienização interna" },
      ]} />
      <MobileInput label="Valor (R$)" type="number" value={valor} onChange={setValor} placeholder="0,00" step="0.01" prefix="R$" />
      <MobileInput label="Lava-rápido / Local" type="text" value={local} onChange={setLocal} placeholder="Nome do estabelecimento" />
      <MobileTextarea label="Observações" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Lavagem" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

function FormMulta({ vehicleId, employeeId, onClose }: { vehicleId: string; employeeId: string; onClose: () => void }) {
  const { createTrafficFine } = useTrafficFines();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [tipo, setTipo]     = useState("");
  const [valor, setValor]   = useState("");
  const [local, setLocal]   = useState("");
  const [obs, setObs]       = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!tipo || !valor || !local) { toast({ title: "Preencha tipo, valor e local", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      employee_id: employeeId,
      data_multa: new Date().toISOString().split("T")[0],
      tipo_infracao: tipo,
      valor: parseFloat(valor),
      local_infracao: local,
      situacao: "pendente",
      observacoes: obs || null,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "traffic_fines", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createTrafficFine(payload);
      onClose();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <MobileSelect label="Tipo de infração" value={tipo} onChange={setTipo} options={[
        { value: "velocidade",       label: "Excesso de velocidade" },
        { value: "estacionamento",   label: "Estacionamento irregular" },
        { value: "sinal_vermelho",   label: "Avanço de sinal" },
        { value: "documentacao",     label: "Documentação" },
        { value: "uso_celular",      label: "Uso de celular" },
        { value: "outros",           label: "Outros" },
      ]} />
      <MobileInput label="Valor da multa (R$)" type="number" value={valor} onChange={setValor} placeholder="0,00" step="0.01" prefix="R$" />
      <MobileInput label="Local da infração" type="text" value={local} onChange={setLocal} placeholder="Ex: Av. Paulista, 1000" />
      <MobileTextarea label="Observações" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Multa" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

function FormAvaria({ vehicleId, employeeId, onClose }: { vehicleId: string; employeeId: string; onClose: () => void }) {
  const { createDamageReport } = useDamageReports();
  const { isOnline, refreshCount } = useOnlineStatus();
  const { toast } = useToast();
  const [descricao, setDescricao] = useState("");
  const [local, setLocal]         = useState("");
  const [obs, setObs]             = useState("");
  const [saving, setSaving]       = useState(false);

  const handleSave = async () => {
    if (!descricao) { toast({ title: "Descreva a avaria", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      vehicle_id: vehicleId,
      employee_id: employeeId,
      data_avaria: new Date().toISOString().split("T")[0],
      descricao_avaria: descricao,
      local_ocorrencia: local || null,
      observacoes: obs || null,
    };

    try {
      if (!isOnline) {
        enqueue({ table: "damage_reports", action: "insert", payload });
        refreshCount();
        toast({ title: "Salvo offline ✓", description: "Será enviado quando houver conexão" });
        onClose();
        return;
      }
      await createDamageReport(payload as any);
      onClose();
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <MobileTextarea label="Descrição da avaria *" value={descricao} onChange={setDescricao} placeholder="Descreva o que aconteceu..." />
      <MobileInput label="Local da ocorrência" type="text" value={local} onChange={setLocal} placeholder="Ex: Rodovia SP-330, km 120" />
      <MobileTextarea label="Observações adicionais" value={obs} onChange={setObs} />
      <SubmitButton label="Registrar Avaria" onSave={handleSave} saving={saving} offline={!isOnline} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AppLancar() {
  const [selected, setSelected] = useState<LancarType>(null);
  const { vehicle, loading } = useEmployeeVehicle();
  const { employee } = useCurrentEmployee();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center gap-3">
        <Truck className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500 text-sm">Você não possui um veículo atribuído. Fale com o gestor.</p>
      </div>
    );
  }

  // Form mode
  if (selected) {
    const opcao = opcoes.find(o => o.id === selected)!;
    const { Icon } = opcao;

    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className={cn("px-4 pt-10 pb-5 flex items-center gap-3", opcao.color)}>
          <button onClick={() => setSelected(null)} className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <Icon className="h-5 w-5 text-white" />
          <h1 className="text-white font-bold text-base">{opcao.label}</h1>
          <div className="ml-auto text-right">
            <p className="text-white/80 text-xs">{vehicle.placa}</p>
            <p className="text-white/60 text-[10px]">{vehicle.marca} {vehicle.modelo}</p>
          </div>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            {selected === "abastecimento" && <FormAbastecimento vehicleId={vehicle.id} employeeId={employee?.id ?? ""} onClose={() => setSelected(null)} />}
            {selected === "manutencao"   && <FormManutencao    vehicleId={vehicle.id} employeeId={employee?.id ?? ""} km={vehicle.quilometragem_atual} onClose={() => setSelected(null)} />}
            {selected === "borracharia"  && <FormBorracharia   vehicleId={vehicle.id} employeeId={employee?.id ?? ""} onClose={() => setSelected(null)} />}
            {selected === "lavagem"      && <FormLavagem       vehicleId={vehicle.id} employeeId={employee?.id ?? ""} onClose={() => setSelected(null)} />}
            {selected === "multa"        && <FormMulta         vehicleId={vehicle.id} employeeId={employee?.id ?? ""} onClose={() => setSelected(null)} />}
            {selected === "avaria"       && <FormAvaria        vehicleId={vehicle.id} employeeId={employee?.id ?? ""} onClose={() => setSelected(null)} />}
          </div>
        </div>
      </div>
    );
  }

  // Menu mode
  return (
    <div className="min-h-full">
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 px-4 pt-10 pb-6 text-white">
        <h1 className="text-lg font-bold">Lançar</h1>
        <p className="text-slate-300 text-sm">{vehicle.placa} · {vehicle.marca} {vehicle.modelo}</p>
      </div>

      <div className="p-4 -mt-2 space-y-3">
        {opcoes.map(({ id, label, Icon, color }) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className="w-full flex items-center gap-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{label}</p>
              <p className="text-xs text-slate-400">Registrar {label.toLowerCase()} do veículo</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300 rotate-180 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
