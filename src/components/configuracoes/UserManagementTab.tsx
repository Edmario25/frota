import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  UserPlus, Search, ShieldCheck, User, Pencil,
  Eye, EyeOff, Building2, Briefcase, Globe, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
interface UserRow {
  user_id:            string;
  nome:               string;
  email:              string;
  created_at:         string;
  role:               string;               // legado (user_roles)
  employee_id:        string | null;
  employee_nome:      string | null;
  cargo_id:           string | null;
  cargo_nome:         string | null;
  acessa_todas_obras: boolean;
  obras_vinculadas:   { id: string; nome: string }[];
}

interface Obra  { id: string; nome: string }
interface Cargo { id: string; nome: string; acessa_todas_obras: boolean }
interface Employee { id: string; nome: string; cargo_id: string | null; user_id: string | null; cargos: { nome: string; acessa_todas_obras: boolean } | null }

// ─── Helpers de estilo ────────────────────────────────────────────────────────
function CargoBadge({ nome, acessa_todas_obras }: { nome: string | null; acessa_todas_obras: boolean }) {
  if (!nome) return <span className="text-xs text-muted-foreground italic">Sem cargo</span>;
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className="rounded-full text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <Briefcase className="h-2.5 w-2.5 mr-1" />
        {nome}
      </Badge>
      {acessa_todas_obras && (
        <Badge variant="outline" className="rounded-full text-[10px] bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300">
          <Globe className="h-2.5 w-2.5 mr-1" />
          Todas obras
        </Badge>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function UserManagementTab() {
  const [users, setUsers]   = useState<UserRow[]>([]);
  const [obras, setObras]   = useState<Obra[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search,  setSearch]      = useState("");

  // Modais
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [selected,   setSelected]   = useState<UserRow | null>(null);

  // Form criar
  const [fNome,        setFNome]        = useState("");
  const [fEmail,       setFEmail]       = useState("");
  const [fSenha,       setFSenha]       = useState("");
  const [fShowSenha,   setFShowSenha]   = useState(false);
  const [fEmployeeId,  setFEmployeeId]  = useState("");
  const [creating,     setCreating]     = useState(false);

  // Form editar
  const [eEmployeeId, setEEmployeeId] = useState("");
  const [eObraIds,    setEObraIds]    = useState<string[]>([]);
  const [saving,      setSaving]      = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: profiles },
        { data: roles },
        { data: emps },
        { data: assignments },
        { data: obrasData },
      ] = await Promise.all([
        supabase.from("profiles").select("user_id, nome, email, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        (supabase as any).from("employees").select("id, nome, cargo_id, user_id, cargos(nome, acessa_todas_obras)"),
        (supabase as any).from("employee_obra_assignments").select("employee_id, obra_id, obras(id, nome)"),
        supabase.from("obras").select("id, nome").order("nome"),
      ]);

      setObras((obrasData ?? []) as Obra[]);
      setEmployees((emps ?? []) as Employee[]);

      const rows: UserRow[] = (profiles ?? []).map((p: any) => {
        const role     = roles?.find((r: any) => r.user_id === p.user_id)?.role ?? "funcionario";
        const emp      = emps?.find((e: any) => e.user_id === p.user_id) ?? null;
        const cargo    = (emp as any)?.cargos ?? null;
        const empObras = (assignments ?? [])
          .filter((a: any) => a.employee_id === emp?.id)
          .map((a: any) => a.obras)
          .filter(Boolean) as { id: string; nome: string }[];

        return {
          user_id:            p.user_id,
          nome:               p.nome,
          email:              p.email,
          created_at:         p.created_at,
          role,
          employee_id:        emp?.id ?? null,
          employee_nome:      emp?.nome ?? null,
          cargo_id:           emp?.cargo_id ?? null,
          cargo_nome:         cargo?.nome ?? null,
          acessa_todas_obras: cargo?.acessa_todas_obras ?? false,
          obras_vinculadas:   empObras,
        };
      });

      setUsers(rows);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Criar usuário ────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!fEmail || !fSenha || !fNome) { toast.error("Preencha nome, e-mail e senha"); return; }
    if (fSenha.length < 6) { toast.error("Senha deve ter no mínimo 6 caracteres"); return; }

    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_auth_user", {
        p_email: fEmail, p_password: fSenha, p_nome: fNome,
        p_tipo_acesso: "funcionario",
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? "Erro desconhecido");

      // Vincular ao employee se selecionado
      if (fEmployeeId) {
        await (supabase as any)
          .from("employees")
          .update({ user_id: data.user_id })
          .eq("id", fEmployeeId);
      }

      toast.success("Usuário criado com sucesso!");
      setCreateOpen(false);
      setFNome(""); setFEmail(""); setFSenha(""); setFEmployeeId("");
      fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  }

  // ─── Abrir edição ─────────────────────────────────────────────────────────
  function openEdit(user: UserRow) {
    setSelected(user);
    setEEmployeeId(user.employee_id ?? "");
    setEObraIds(user.obras_vinculadas.map(o => o.id));
    setEditOpen(true);
  }

  // ─── Salvar edição ────────────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      // 1. Atualizar vínculo employee ↔ user
      if (eEmployeeId && eEmployeeId !== selected.employee_id) {
        // Desvincular user_id do employee anterior (se existia)
        if (selected.employee_id) {
          await (supabase as any).from("employees").update({ user_id: null }).eq("id", selected.employee_id);
        }
        // Vincular ao novo employee
        await (supabase as any).from("employees").update({ user_id: selected.user_id }).eq("id", eEmployeeId);
      } else if (!eEmployeeId && selected.employee_id) {
        // Desvincular
        await (supabase as any).from("employees").update({ user_id: null }).eq("id", selected.employee_id);
      }

      // 2. Atualizar obras (só se tem employee vinculado)
      const empId = eEmployeeId || selected.employee_id;
      if (empId) {
        // Pegar cargo para verificar acessa_todas_obras
        const emp = employees.find(e => e.id === empId);
        const cargo = (emp as any)?.cargos;

        if (!cargo?.acessa_todas_obras) {
          // Remover todas as obras atuais
          await (supabase as any)
            .from("employee_obra_assignments")
            .delete()
            .eq("employee_id", empId);

          // Inserir obras selecionadas
          if (eObraIds.length > 0) {
            await (supabase as any)
              .from("employee_obra_assignments")
              .insert(eObraIds.map(obra_id => ({ employee_id: empId, obra_id })));
          }
        }
      }

      toast.success("Usuário atualizado!");
      setEditOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ─── Filtro ───────────────────────────────────────────────────────────────
  const filtered = users.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.cargo_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Employees disponíveis para vincular (sem user_id já vinculado, exceto o próprio)
  const availableEmployees = employees.filter(e =>
    !e.user_id || e.user_id === selected?.user_id || e.id === eEmployeeId
  );

  // Cargo do employee selecionado na edição
  const editEmp   = employees.find(e => e.id === eEmployeeId);
  const editCargo = (editEmp as any)?.cargos as { nome: string; acessa_todas_obras: boolean } | null;

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const comCargo   = users.filter(u => u.cargo_nome).length;
  const semVinculo = users.filter(u => !u.employee_id).length;

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total de Usuários",    value: users.length,   icon: User,       color: "bg-primary/10 text-primary" },
          { label: "Com cargo vinculado",  value: comCargo,       icon: Briefcase,  color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
          { label: "Acesso total (obras)", value: users.filter(u => u.acessa_todas_obras).length, icon: Globe, color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30" },
          { label: "Sem funcionário",      value: semVinculo,     icon: AlertCircle,color: semVinculo > 0 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted/50 text-muted-foreground" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-subtle rounded-2xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0", s.color)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-lg">Usuários do Sistema</CardTitle>
              <CardDescription>Logins de acesso, funcionário vinculado e obras permitidas</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2 rounded-xl">
              <UserPlus className="h-4 w-4" /> Novo Usuário
            </Button>
          </div>
          <div className="relative mt-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Usuário</TableHead>
                    <TableHead>Funcionário Vinculado</TableHead>
                    <TableHead>Cargo / Permissões</TableHead>
                    <TableHead>Obras</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(u => (
                    <TableRow key={u.user_id} className="hover:bg-muted/20">
                      <TableCell>
                        <p className="font-medium text-sm">{u.nome}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </TableCell>
                      <TableCell>
                        {u.employee_nome
                          ? <span className="text-sm">{u.employee_nome}</span>
                          : <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Não vinculado
                            </span>
                        }
                      </TableCell>
                      <TableCell>
                        <CargoBadge nome={u.cargo_nome} acessa_todas_obras={u.acessa_todas_obras} />
                      </TableCell>
                      <TableCell>
                        {u.acessa_todas_obras
                          ? <span className="text-xs text-muted-foreground italic">Todas</span>
                          : u.obras_vinculadas.length > 0
                            ? <span className="text-xs text-muted-foreground">
                                {u.obras_vinculadas.slice(0, 2).map(o => o.nome).join(", ")}
                                {u.obras_vinculadas.length > 2 && ` +${u.obras_vinculadas.length - 2}`}
                              </span>
                            : <span className="text-xs text-muted-foreground italic">Nenhuma</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="gap-1.5 h-8">
                          <Pencil className="h-3.5 w-3.5" /> Editar
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

      {/* ─── Modal Criar Usuário ─────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Criar Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Crie o login de acesso e vincule a um funcionário existente. As permissões virão automaticamente do cargo do funcionário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo <span className="text-red-500">*</span></Label>
              <Input value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do usuário" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail <span className="text-red-500">*</span></Label>
              <Input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="email@exemplo.com" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Senha <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={fShowSenha ? "text" : "password"}
                  value={fSenha}
                  onChange={e => setFSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="rounded-xl pr-10"
                />
                <Button type="button" variant="ghost" size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setFShowSenha(v => !v)}>
                  {fShowSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Vincular a um Funcionário
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Select value={fEmployeeId || "__none__"} onValueChange={v => setFEmployeeId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o funcionário..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="__none__">— Não vincular agora —</SelectItem>
                  {employees.filter(e => !e.user_id).map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} {(e as any).cargos?.nome ? `· ${(e as any).cargos.nome}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                As permissões do usuário serão definidas pelo cargo do funcionário vinculado.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-xl">
              {creating ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Editar Usuário ────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" /> Editar Usuário
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{selected?.nome}</span>
              <span className="ml-1 text-muted-foreground">· {selected?.email}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Funcionário vinculado */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Funcionário Vinculado
              </Label>
              <Select value={eEmployeeId || "__none__"} onValueChange={v => { const val = v === "__none__" ? "" : v; setEEmployeeId(val); setEObraIds([]); }}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecione o funcionário..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="__none__">— Sem vínculo —</SelectItem>
                  {availableEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} {(e as any).cargos?.nome ? `· ${(e as any).cargos.nome}` : "· Sem cargo"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cargo (somente leitura) */}
            {eEmployeeId && (
              <div className="rounded-xl bg-muted/40 border border-border/50 px-4 py-3">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Cargo e Permissões</p>
                <CargoBadge
                  nome={editCargo?.nome ?? null}
                  acessa_todas_obras={editCargo?.acessa_todas_obras ?? false}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Para alterar as permissões, edite o cargo em <strong>Cargos</strong> no menu Admin.
                </p>
              </div>
            )}

            <Separator />

            {/* Obras vinculadas */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Label>Obras com acesso</Label>
              </div>

              {!eEmployeeId ? (
                <p className="text-sm text-muted-foreground">Vincule um funcionário para gerenciar obras.</p>
              ) : editCargo?.acessa_todas_obras ? (
                <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-3 flex items-center gap-3">
                  <Globe className="h-4 w-4 text-violet-600 flex-shrink-0" />
                  <p className="text-sm text-violet-700 dark:text-violet-300">
                    O cargo <strong>{editCargo.nome}</strong> tem acesso a todas as obras — não é necessário selecionar individualmente.
                  </p>
                </div>
              ) : obras.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada.</p>
              ) : (
                <div className="border border-border/60 rounded-xl overflow-hidden">
                  {obras.map((obra, idx) => (
                    <label
                      key={obra.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors",
                        idx > 0 && "border-t border-border/40"
                      )}
                    >
                      <Checkbox
                        checked={eObraIds.includes(obra.id)}
                        onCheckedChange={checked => {
                          setEObraIds(prev =>
                            checked ? [...prev, obra.id] : prev.filter(id => id !== obra.id)
                          );
                        }}
                      />
                      <span className="text-sm">{obra.nome}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl" disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="rounded-xl">
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
