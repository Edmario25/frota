import { useI18n } from "@/i18n";
import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, MoreHorizontal, Edit, UserX, Eye, ShieldCheck, Shield, User, Download, CreditCard, ClipboardList } from "lucide-react";
import { CrachaFuncionarioDialog } from "@/components/funcionarios/CrachaFuncionarioDialog";
import { PerfilRhSheet } from "@/components/funcionarios/PerfilRhSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEmployees, type EmployeeWithRelations } from "@/hooks/useEmployees";
import { EmployeeFormModal } from "@/components/funcionarios/EmployeeFormModal";
import { ConfirmDeleteEmployeeModal } from "@/components/funcionarios/ConfirmDeleteEmployeeModal";
import { ViewEmployeeModal } from "@/components/funcionarios/ViewEmployeeModal";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { downloadCsv } from "@/lib/exportCsv";
import { useUserRole } from "@/hooks/useUserRole";

type Employee = EmployeeWithRelations;

const maskCpf = (cpf: string) => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
};

const statusConfig: Record<string, { label: string; color: string }> = {
  ativo:    { label: "Ativo",    color: "bg-emerald-100 text-emerald-700 border-0" },
  inativo:  { label: "Inativo",  color: "bg-slate-100 text-slate-600 border-0" },
  ferias:   { label: "Férias",   color: "bg-blue-100 text-blue-700 border-0" },
  licenca:  { label: "Licença",  color: "bg-amber-100 text-amber-700 border-0" },
};

const nivelAcessoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  funcionario:     { label: "Funcionário",        color: "bg-emerald-100 text-emerald-700", icon: User },
  gestor_obra:     { label: "Gestor de Obras",    color: "bg-amber-100 text-amber-700",     icon: Shield },
  gestor_contrato: { label: "Gest. Contratos",    color: "bg-violet-100 text-violet-700",   icon: ShieldCheck },
  colaborador:     { label: "Funcionário",        color: "bg-emerald-100 text-emerald-700", icon: User },
  // legado
  gestor_geral:    { label: "Gest. Contratos",    color: "bg-violet-100 text-violet-700",   icon: ShieldCheck },
};

const Funcionarios = () => {
  const { t, date } = useI18n();
  const { employees, loading, createEmployee, updateEmployee, terminateEmployee, getEmployeeStats } = useEmployees();
  const { role } = useUserRole();
  const canAccessSensitiveRh = role === 'admin' || role === 'gestor_contrato' || role === 'gestor_frota';
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isCrachaOpen, setIsCrachaOpen]   = useState(false);
  const [isRhOpen,     setIsRhOpen]       = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const stats = getEmployeeStats();

  const filteredEmployees = employees.filter(employee => 
    employee.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.cpf.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.cargos?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.departamentos?.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateEmployee = async (data: any) => {
    await createEmployee(data);
  };

  const handleUpdateEmployee = async (data: any) => {
    if (selectedEmployee) {
      await updateEmployee(selectedEmployee.id, data);
    }
  };

  const handleTerminateEmployee = async (date: string, reason: string) => {
    if (selectedEmployee) {
      await terminateEmployee(selectedEmployee.id, date, reason);
      setIsDeleteModalOpen(false);
      setSelectedEmployee(null);
    }
  };

  const openEditModal = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsFormModalOpen(true);
  };

  const openDeleteModal = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteModalOpen(true);
  };

  const openViewModal = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsViewModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelectedEmployee(null);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (loading) return <PageSkeleton statsCount={4} columns={7} rows={7} />;

  return (
    <Layout>
      <div className="space-y-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight">{t("Funcionários")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("Gerencie o cadastro de funcionários")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const headers = ['Nome', 'CPF', 'Email', 'Telefone', 'Cargo', 'Departamento', 'Status', 'Data Admissão', 'Tipo de Acesso'].map(t);
                const rows = filteredEmployees.map(e => [
                  e.nome,
                  canAccessSensitiveRh ? e.cpf : maskCpf(e.cpf),
                  e.email,
                  e.telefone ?? '',
                  e.cargos?.nome ?? '',
                  e.departamentos?.nome ?? '',
                  t(statusConfig[e.status]?.label ?? e.status),
                  e.data_admissao ? date(e.data_admissao) : '',
                  t(nivelAcessoConfig[e.tipo_acesso ?? '']?.label ?? e.tipo_acesso ?? ''),
                ]);
                downloadCsv(headers, rows, `funcionarios_${new Date().toISOString().slice(0, 10)}`);
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {t("Exportar CSV")}
            </Button>
            <Button size="sm" onClick={() => setIsFormModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("Novo Funcionário")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[
            { label: "Ativos",   value: stats.ativo,   color: "text-emerald-600" },
            { label: "Inativos", value: stats.inativo, color: "text-muted-foreground" },
            { label: "Férias",   value: stats.ferias,  color: "text-primary" },
            { label: "Licença",  value: stats.licenca, color: "text-amber-600" },
          ].map((s) => (
            <div key={t(s.label)} className="rounded-lg border border-border/50 bg-card px-4 py-3 shadow-card">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{t(s.label)}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t("Buscar por nome, CPF ou cargo...")}
            className="pl-8 h-8 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Funcionário")}</TableHead>
                <TableHead>{t("CPF")}</TableHead>
                <TableHead>{t("Cargo")}</TableHead>
                <TableHead>{t("Contato")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Tipo de Acesso")}</TableHead>
                <TableHead className="w-[100px]">{t("Ações")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={employee.foto_url || undefined} />
                        <AvatarFallback>
                          {getInitials(employee.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{employee.nome}</div>
                        <div className="text-sm text-muted-foreground">
                          {employee.departamentos?.nome || 'Sem departamento'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{canAccessSensitiveRh ? employee.cpf : maskCpf(employee.cpf)}</TableCell>
                  <TableCell>{employee.cargos?.nome || 'Não informado'}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{employee.email}</p>
                      <p className="text-muted-foreground">{employee.telefone || 'N/A'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const cfg = statusConfig[employee.status] ?? { label: employee.status, color: "" };
                      return <Badge className={cfg.color}>{t(cfg.label)}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Prefer cargo's nivel_acesso (up to date), fall back to employee.tipo_acesso
                      const nivel = employee.tipo_acesso || "funcionario";
                      const cfg = nivelAcessoConfig[nivel] ?? nivelAcessoConfig.funcionario;
                      const Icon = cfg.icon;
                      return (
                        <Badge className={`${cfg.color} border-0 flex items-center gap-1 w-fit text-xs`}>
                          <Icon className="h-3 w-3" />
                          {t(cfg.label)}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(employee)}>
                          <Edit className="h-4 w-4 mr-2" />
                          {t("Editar")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openViewModal(employee)}>
                          <Eye className="h-4 w-4 mr-2" />
                          {t("Visualizar")}
                        </DropdownMenuItem>
                        {canAccessSensitiveRh && (
                          <DropdownMenuItem onClick={() => { setSelectedEmployee(employee); setIsRhOpen(true); }}>
                            <ClipboardList className="h-4 w-4 mr-2 text-blue-500" />
                            {t("Perfil RH")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => { setSelectedEmployee(employee); setIsCrachaOpen(true); }}>
                          <CreditCard className="h-4 w-4 mr-2 text-violet-500" />
                          Gerar Crachá
                        </DropdownMenuItem>
                        {canAccessSensitiveRh && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => openDeleteModal(employee)}
                              className="text-destructive"
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              {t("Desligar")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchTerm ? 'Nenhum funcionário encontrado para a busca.' : 'Nenhum funcionário cadastrado.'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
        
        {/* Modals */}
        <EmployeeFormModal 
          open={isFormModalOpen}
          onOpenChange={closeFormModal}
          employee={selectedEmployee || undefined}
          onSubmit={selectedEmployee ? handleUpdateEmployee : handleCreateEmployee}
        />
        
        <ConfirmDeleteEmployeeModal 
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
          employee={selectedEmployee}
          onConfirm={handleTerminateEmployee}
        />

        <ViewEmployeeModal
          open={isViewModalOpen}
          onOpenChange={setIsViewModalOpen}
          employee={selectedEmployee}
        />

        {selectedEmployee && (
          <CrachaFuncionarioDialog
            open={isCrachaOpen}
            onOpenChange={setIsCrachaOpen}
            employee={selectedEmployee}
          />
        )}

        <PerfilRhSheet
          open={isRhOpen}
          onOpenChange={setIsRhOpen}
          employee={selectedEmployee}
        />
      </div>
    </Layout>
  );
};

export default Funcionarios;
