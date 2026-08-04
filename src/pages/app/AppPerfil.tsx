import { useState } from "react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { LogOut, KeyRound, Eye, EyeOff, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export function AppPerfil() {
  const { employee } = useCurrentEmployee();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [showPwd, setShowPwd]         = useState(false);
  const [newPwd, setNewPwd]           = useState("");
  const [confirmPwd, setConfirmPwd]   = useState("");
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);

  const displayName  = employee?.nome ?? user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const displayEmail = employee?.email ?? user?.email ?? "—";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const handleChangePwd = async () => {
    if (newPwd.length < 6) { toast({ title: "Mínimo 6 caracteres", variant: "destructive" }); return; }
    if (newPwd !== confirmPwd) { toast({ title: "As senhas não coincidem", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast({ title: "Senha alterada com sucesso!" });
      setNewPwd(""); setConfirmPwd(""); setShowPwd(false);
    } catch (e: any) {
      toast({ title: "Erro ao alterar senha", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-4 pt-10 pb-10 text-white flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
          {getInitials(displayName)}
        </div>
        <div className="text-center">
          <p className="font-bold text-lg">{displayName}</p>
          <p className="text-slate-300 text-sm">{displayEmail}</p>
          {employee?.cargos?.nome && (
            <p className="text-xs text-slate-400 mt-0.5">{employee.cargos.nome}</p>
          )}
        </div>
      </div>

      <div className="px-4 -mt-4 space-y-4 pb-10">
        {/* Info card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm divide-y divide-slate-100 dark:divide-slate-700">
          {employee?.telefone && (
            <InfoRow label="Telefone" value={employee.telefone} />
          )}
          {employee?.departamentos?.nome && (
            <InfoRow label="Departamento" value={employee.departamentos.nome} />
          )}
          {employee?.status && (
            <InfoRow
              label="Status"
              value={
                employee.status === "ativo" ? "✅ Ativo"
                : employee.status === "ferias" ? "🌴 Férias"
                : employee.status === "licenca" ? "🏥 Licença"
                : "❌ Inativo"
              }
            />
          )}
        </div>

        {/* Alterar senha */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowPwd(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-4"
          >
            <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <KeyRound className="h-5 w-5 text-blue-600" />
            </div>
            <p className="flex-1 text-left font-semibold text-slate-700 dark:text-slate-200">Alterar Senha</p>
            <span className="text-xs text-slate-400">{showPwd ? "▲" : "▼"}</span>
          </button>

          {showPwd && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
              <PasswordInput label="Nova senha" value={newPwd} onChange={setNewPwd} show={showNew} onToggle={() => setShowNew(v => !v)} />
              <PasswordInput label="Confirmar senha" value={confirmPwd} onChange={setConfirmPwd} show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
              <button
                onClick={handleChangePwd}
                disabled={saving || !newPwd || !confirmPwd}
                className="w-full h-11 bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {saving ? "Salvando..." : "Salvar Nova Senha"}
              </button>
            </div>
          )}
        </div>

        {/* Sair */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm px-4 py-4 text-red-500"
        >
          <div className="h-10 w-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <LogOut className="h-5 w-5 text-red-500" />
          </div>
          <p className="font-semibold">Sair do aplicativo</p>
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function PasswordInput({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className="w-full h-12 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
