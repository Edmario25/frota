import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

interface AppLoginProps {
  onSuccess: () => void;
}

export function AppLogin({ onSuccess }: AppLoginProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setError("");
    setIsLoading(true);
    const { error: authError } = await signIn(email, password);
    setIsLoading(false);
    if (authError) {
      setError("E-mail ou senha incorretos.");
    } else {
      onSuccess();
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-900 overflow-hidden">
      {/* Header decorativo */}
      <div className="flex-shrink-0 bg-gradient-to-b from-blue-700 to-slate-900 pt-16 pb-10 flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-900/60 mb-4">
          <Truck className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">App do Motorista</h1>
        <p className="text-blue-200 text-sm mt-1">Gestão de Frotas</p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex flex-col justify-start px-6 pt-8 gap-4">
        {/* Campo e-mail */}
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyPress={handleKey}
            className="w-full h-14 pl-12 pr-4 rounded-xl bg-slate-800 text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-blue-500 text-base"
          />
        </div>

        {/* Campo senha */}
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Sua senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyPress={handleKey}
            className="w-full h-14 pl-12 pr-12 rounded-xl bg-slate-800 text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-blue-500 text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* Erro */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Botão entrar */}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full h-14 rounded-xl bg-blue-600 active:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors mt-2 shadow-lg shadow-blue-900/40"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </button>

        <p className="text-center text-xs text-slate-500 mt-4">
          Acesso exclusivo para motoristas autorizados.{"\n"}
          Em caso de dúvidas, fale com o gestor.
        </p>
      </div>
    </div>
  );
}
