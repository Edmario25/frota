import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  User, Mail, Phone, Briefcase, Building2, Calendar, ShieldCheck, Shield,
} from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig: Record<string, { label: string; color: string }> = {
  ativo:   { label: "Ativo",   color: "bg-emerald-100 text-emerald-700 border-0" },
  inativo: { label: "Inativo", color: "bg-slate-100 text-slate-600 border-0" },
  ferias:  { label: "Férias",  color: "bg-blue-100 text-blue-700 border-0" },
  licenca: { label: "Licença", color: "bg-amber-100 text-amber-700 border-0" },
};

const acessoConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  funcionario:     { label: "Funcionário",        icon: User,        color: "bg-emerald-100 text-emerald-700" },
  colaborador:     { label: "Funcionário",        icon: User,        color: "bg-emerald-100 text-emerald-700" },
  gestor_obra:     { label: "Gestor de Obras",    icon: Shield,      color: "bg-amber-100 text-amber-700" },
  gestor_contrato: { label: "Gestor de Contratos",icon: ShieldCheck, color: "bg-violet-100 text-violet-700" },
};

export default function MinhasInformacoes() {
  const { employee, loading } = useCurrentEmployee();

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  if (loading) return <PageSkeleton statsCount={0} columns={3} rows={4} />;

  if (!employee) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Não foi possível carregar seu perfil.</p>
        </div>
      </Layout>
    );
  }

  const status  = statusConfig[employee.status] ?? { label: employee.status, color: "" };
  const acesso  = acessoConfig[employee.tipo_acesso ?? "funcionario"] ?? acessoConfig.funcionario;
  const AcessoIcon = acesso.icon;

  return (
    <Layout>
      <div className="space-y-5 max-w-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suas informações pessoais e profissionais</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* Avatar + nome */}
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
                  {getInitials(employee.nome)}
                </AvatarFallback>
                <AvatarImage src={employee.foto_url ?? undefined} />
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{employee.nome}</h2>
                <p className="text-sm text-muted-foreground">{employee.email}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className={status.color}>{status.label}</Badge>
                  <Badge className={`${acesso.color} border-0 flex items-center gap-1`}>
                    <AcessoIcon className="h-3 w-3" />
                    {acesso.label}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator className="mb-5" />

            {/* Dados pessoais */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Dados Pessoais
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <InfoRow icon={User}      label="CPF"      value={employee.cpf} />
              <InfoRow icon={Mail}      label="E-mail"   value={employee.email} />
              <InfoRow icon={Phone}     label="Telefone" value={employee.telefone ?? "—"} />
              <InfoRow
                icon={Calendar}
                label="Data de Admissão"
                value={
                  employee.data_admissao
                    ? format(new Date(employee.data_admissao), "dd/MM/yyyy", { locale: ptBR })
                    : "—"
                }
              />
            </div>

            <Separator className="mb-5" />

            {/* Dados profissionais */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Dados Profissionais
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={Briefcase}  label="Cargo"        value={employee.cargos?.nome ?? "—"} />
              <InfoRow icon={Building2}  label="Departamento" value={employee.departamentos?.nome ?? "—"} />
            </div>
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
