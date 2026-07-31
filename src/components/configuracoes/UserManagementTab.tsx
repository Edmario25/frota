import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Search, Shield, ShieldCheck, User, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

interface UserWithRole {
  id: string;
  email: string;
  nome: string;
  role: string;
  created_at: string;
  employee_nome?: string;
}

const roleLabels: Record<string, string> = {
  gestor_contrato: "Gestor de Contratos",
  admin: "Gestor de Contratos",
  gestor_frota: "Gestor de Contratos",
  gestor_obra: "Gestor de Obras",
  funcionario: "Funcionário",
};

const roleBadgeVariant: Record<string, string> = {
  gestor_contrato: "bg-violet-100 text-violet-700 border-violet-200",
  admin: "bg-violet-100 text-violet-700 border-violet-200",
  gestor_frota: "bg-violet-100 text-violet-700 border-violet-200",
  gestor_obra: "bg-amber-100 text-amber-700 border-amber-200",
  funcionario: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function UserManagementTab() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState("");

  // Create user form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [newTipoAcesso, setNewTipoAcesso] = useState("colaborador");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch profiles with roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          id: profile.user_id,
          email: profile.email,
          nome: profile.nome,
          role: userRole?.role || "funcionario",
          created_at: profile.created_at,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || !newNome) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_auth_user", {
        p_email: newEmail,
        p_password: newPassword,
        p_nome: newNome,
        p_tipo_acesso: newTipoAcesso,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Erro desconhecido");

      toast.success("Usuário criado com sucesso!");
      setShowCreateModal(false);
      setNewEmail("");
      setNewPassword("");
      setNewNome("");
      setNewTipoAcesso("colaborador");
      fetchUsers();
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      toast.error(error.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser || !newRole) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", selectedUser.id);

      if (error) throw error;

      toast.success("Permissão atualizada com sucesso!");
      setShowEditRoleModal(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Erro ao atualizar role:", error);
      toast.error("Erro ao atualizar permissão");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.nome.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: "Total de Usuários", value: users.length, icon: User, color: "bg-primary/10 text-primary" },
          { label: "Gest. Contratos", value: users.filter((u) => ["gestor_contrato","admin","gestor_frota"].includes(u.role)).length, icon: ShieldCheck, color: "bg-violet-100 text-violet-600" },
          { label: "Gest. de Obras", value: users.filter((u) => u.role === "gestor_obra").length, icon: Shield, color: "bg-amber-100 text-amber-600" },
          { label: "Funcionários", value: users.filter((u) => u.role === "funcionario").length, icon: User, color: "bg-emerald-100 text-emerald-600" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-subtle rounded-2xl">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg">Usuários do Sistema</CardTitle>
              <CardDescription>Gerencie acessos e permissões dos usuários</CardDescription>
            </div>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2 rounded-xl">
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </Button>
          </div>
          <div className="relative mt-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum usuário encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Permissão</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.nome}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${roleBadgeVariant[user.role] || ""} rounded-full px-3`}>
                          {roleLabels[user.role] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(user.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role);
                            setShowEditRoleModal(true);
                          }}
                          className="gap-1.5"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>Preencha os dados para criar um novo acesso ao sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input id="nome" value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome do usuário" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemplo.com" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="rounded-xl pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo_acesso">Nível de Acesso</Label>
              <Select value={newTipoAcesso} onValueChange={setNewTipoAcesso}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestor_contrato">Gestor de Contratos — acesso total</SelectItem>
                  <SelectItem value="gestor_obra">Gestor de Obras — acesso à sua obra</SelectItem>
                  <SelectItem value="funcionario">Funcionário — acesso pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={creating} className="rounded-xl">
              {creating ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Modal */}
      <Dialog open={showEditRoleModal} onOpenChange={setShowEditRoleModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Alterar Permissão</DialogTitle>
            <DialogDescription>
              Alterar o nível de acesso de <strong>{selectedUser?.nome}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nova Permissão</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestor_contrato">Gestor de Contratos — acesso total</SelectItem>
                  <SelectItem value="gestor_obra">Gestor de Obras — acesso à sua obra</SelectItem>
                  <SelectItem value="funcionario">Funcionário — acesso pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRoleModal(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} className="rounded-xl">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
