import React, { useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User, Mail, Phone, Briefcase, Building2, Calendar,
  ShieldCheck, Shield, Camera, KeyRound, Eye, EyeOff,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  ativo:   { label: "Ativo",   color: "bg-emerald-100 text-emerald-700 border-0" },
  inativo: { label: "Inativo", color: "bg-slate-100 text-slate-600 border-0" },
  ferias:  { label: "Férias",  color: "bg-blue-100 text-blue-700 border-0" },
  licenca: { label: "Licença", color: "bg-amber-100 text-amber-700 border-0" },
};

const acessoConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  funcionario:     { label: "Funcionário",         icon: User,        color: "bg-emerald-100 text-emerald-700" },
  colaborador:     { label: "Funcionário",         icon: User,        color: "bg-emerald-100 text-emerald-700" },
  gestor_obra:     { label: "Gestor de Obras",     icon: Shield,      color: "bg-amber-100 text-amber-700" },
  gestor_contrato: { label: "Gestor de Contratos", icon: ShieldCheck, color: "bg-violet-100 text-violet-700" },
};

export default function MinhasInformacoes() {
  const { employee, loading } = useCurrentEmployee();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew]               = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [passwordError, setPasswordError]   = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const handlePhotoClick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
    setUploadingPhoto(true);

    try {
      const ext      = file.name.split(".").pop();
      const entityId = employee?.id ?? user.id;
      const path     = `employees/${entityId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("vehicle-photos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("vehicle-photos")
        .getPublicUrl(path);

      // Se tiver registro de funcionário, atualiza lá; senão atualiza o user_metadata do auth
      if (employee) {
        const { error: updateError } = await supabase
          .from("employees")
          .update({ foto_url: publicUrl })
          .eq("id", employee.id);
        if (updateError) throw updateError;
        await queryClient.invalidateQueries({ queryKey: ["currentEmployee"] });
      } else {
        const { error: metaError } = await supabase.auth.updateUser({
          data: { avatar_url: publicUrl },
        });
        if (metaError) throw metaError;
      }

      toast({ title: "Foto atualizada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
      setPhotoPreview(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Senha alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    } catch (err: any) {
      toast({ title: "Erro ao alterar senha", description: err.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <PageSkeleton statsCount={0} columns={3} rows={4} />;

  // Usa dados do employee se existir, senão usa dados do auth user
  const displayName  = employee?.nome ?? user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Usuário";
  const displayEmail = employee?.email ?? user?.email ?? "—";
  const avatarSrc    = photoPreview ?? employee?.foto_url ?? user?.user_metadata?.avatar_url ?? undefined;

  const status     = employee ? (statusConfig[employee.status] ?? { label: employee.status, color: "" }) : null;
  const acesso     = employee ? (acessoConfig[employee.tipo_acesso ?? "funcionario"] ?? acessoConfig.funcionario) : null;
  const AcessoIcon = acesso?.icon;

  return (
    <Layout>
      <div className="space-y-5 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suas informações pessoais e profissionais</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* Avatar + nome */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative group">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={handlePhotoClick}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold">{displayName}</h2>
                <p className="text-sm text-muted-foreground">{displayEmail}</p>
                {employee && status && acesso && AcessoIcon && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={status.color}>{status.label}</Badge>
                    <Badge className={cn(acesso.color, "border-0 flex items-center gap-1")}>
                      <AcessoIcon className="h-3 w-3" />
                      {acesso.label}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handlePhotoClick}
                  disabled={uploadingPhoto}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {uploadingPhoto ? "Enviando..." : "Alterar foto"}
                </Button>
              </div>
            </div>

            <Separator className="mb-5" />

            {/* Dados pessoais */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Dados Pessoais
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {employee?.cpf && <InfoRow icon={User}  label="CPF"      value={employee.cpf} />}
              <InfoRow icon={Mail}  label="E-mail"   value={displayEmail} />
              {employee?.telefone && <InfoRow icon={Phone} label="Telefone" value={employee.telefone} />}
              {employee?.data_admissao && (
                <InfoRow
                  icon={Calendar}
                  label="Data de Admissão"
                  value={format(new Date(employee.data_admissao), "dd/MM/yyyy", { locale: ptBR })}
                />
              )}
            </div>

            {employee && (employee.cargos?.nome || employee.departamentos?.nome) && (
              <>
                <Separator className="mb-5" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Dados Profissionais
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {employee.cargos?.nome      && <InfoRow icon={Briefcase} label="Cargo"        value={employee.cargos.nome} />}
                  {employee.departamentos?.nome && <InfoRow icon={Building2} label="Departamento" value={employee.departamentos.nome} />}
                </div>
              </>
            )}

            <Separator className="mb-5" />

            {/* Alterar senha */}
            <button
              type="button"
              onClick={() => setShowPasswordSection(v => !v)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground flex-1">Alterar Senha</span>
              {showPasswordSection
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </button>

            {showPasswordSection && (
              <div className="mt-4 space-y-3 pl-10">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {passwordError && (
                  <p className="text-xs text-destructive">{passwordError}</p>
                )}
                <Button
                  size="sm"
                  onClick={handleChangePassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  className="gap-1.5"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  {savingPassword ? "Salvando..." : "Salvar Nova Senha"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
