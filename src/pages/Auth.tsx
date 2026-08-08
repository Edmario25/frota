import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Lock, Mail, Truck, Car, MapPin, Settings, ClipboardList, Gauge } from "lucide-react";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async () => {
    if (!email || !password) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        title: "Erro no login",
        description: "Credenciais inválidas. Verifique seu email e senha.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Login do sistema gerencial → sempre vai ao dashboard
    toast({ title: "Login realizado", description: "Bem-vindo ao sistema!" });
    navigate("/", { replace: true });
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSignIn();
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />
      
      {/* City skyline silhouette */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-blue-900/50 to-transparent" />
      </div>
      
      {/* Floating decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Left side - Truck icon */}
        <div className="absolute left-[5%] bottom-[20%] text-white/10 animate-pulse">
          <Truck className="w-32 h-32 md:w-48 md:h-48" strokeWidth={0.5} />
        </div>
        
        {/* Right side - Car icon */}
        <div className="absolute right-[5%] bottom-[15%] text-white/10 animate-pulse">
          <Car className="w-28 h-28 md:w-40 md:h-40" strokeWidth={0.5} />
        </div>
        
        {/* Decorative icons */}
        <div className="absolute left-[15%] top-[30%] text-white/5">
          <ClipboardList className="w-16 h-16" strokeWidth={0.5} />
        </div>
        <div className="absolute right-[10%] top-[25%] text-primary/30">
          <MapPin className="w-12 h-12" strokeWidth={1} />
        </div>
        <div className="absolute left-[10%] top-[45%] text-white/5">
          <Settings className="w-14 h-14 animate-spin-slow" strokeWidth={0.5} />
        </div>
        
        {/* Glowing orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* Logo */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg shadow-primary/30">
            <Gauge className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-white tracking-tight">GESTÃO DE</span>
          <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400 tracking-tight -mt-1">FROTAS</span>
        </div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="backdrop-blur-xl bg-slate-800/80 rounded-2xl shadow-2xl border border-white/10 p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Bem-vindo de volta!
            </h1>
            <p className="text-slate-400 text-sm md:text-base">
              Faça login para acessar sua conta
            </p>
          </div>

          {/* Form */}
          <div className="space-y-5">
            {/* Email field */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-lg blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <div className="relative flex items-center">
                <div className="absolute left-4 text-slate-400 group-focus-within:text-primary transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="Seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-12 h-14 bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary/20 rounded-lg"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-lg blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <div className="relative flex items-center">
                <div className="absolute left-4 text-slate-400 group-focus-within:text-primary transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-12 pr-12 h-14 bg-slate-700/50 border-slate-600/50 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary/20 rounded-lg"
                />
                <button
                  type="button"
                  className="absolute right-4 text-slate-400 hover:text-white transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <button className="text-sm text-slate-400 hover:text-primary transition-colors">
                Esqueceu a senha?
              </button>
            </div>

            {/* Submit button */}
            <Button 
              onClick={handleSignIn} 
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 border-0 rounded-lg shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:scale-[1.02]"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </div>
              ) : (
                "Entrar"
              )}
            </Button>

          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              Sistema privado — acesso somente para usuários autorizados
            </p>
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-xs text-slate-500 mt-4">
          Caso não possua acesso, entre em contato com o administrador
        </p>
      </div>
    </div>
  );
};

export default Auth;
