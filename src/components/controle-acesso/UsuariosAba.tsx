import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, KeyRound, Search, Trash2, UserPlus, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Usuario = { user_id: string; nome: string | null; email: string | null };
type Funcionario = { id: string; nome: string; user_id: string | null; cargos: { nome: string } | null };
type Perfil = { id: string; nome: string; descricao: string | null; ativo: boolean };
type Atribuicao = {
  id: string; user_id: string; profile_id: string; scope_type: string; scope_id: string | null;
  valido_ate: string | null; justificativa: string | null; access_profiles?: { nome: string } | null;
};
type Opcao = { id: string; nome: string };

const ESCOPOS: Array<{ valor: string; rotulo: string; ajuda: string }> = [
  { valor: "obra", rotulo: "Obras selecionadas", ajuda: "Vale só nas obras marcadas." },
  { valor: "empresa", rotulo: "Empresa toda", ajuda: "Vale em todas as obras e departamentos." },
  { valor: "departamento", rotulo: "Um departamento", ajuda: "Vale para os funcionários do departamento." },
  { valor: "setor", rotulo: "Um setor", ajuda: "Vale para os funcionários do setor." },
  { valor: "equipe", rotulo: "Equipe dele", ajuda: "Vale para quem tem esta pessoa como gestor imediato." },
  { valor: "proprio", rotulo: "Só os próprios registros", ajuda: "Vale apenas para os dados da própria pessoa." },
];

type NovaAtribuicao = { perfil: string; escopo: string; alvos: string[]; validade: string; motivo: string };
const atribuicaoVazia = (): NovaAtribuicao => ({ perfil: "", escopo: "obra", alvos: [], validade: "", motivo: "" });

/** Linhas de employee_access_profiles para gravar; obra gera uma linha por obra marcada. */
function montarLinhas(userId: string, a: NovaAtribuicao) {
  const valido_ate = a.validade ? new Date(a.validade + "T23:59:59").toISOString() : null;
  const base = { user_id: userId, profile_id: a.perfil, scope_type: a.escopo, valido_ate, justificativa: a.motivo.trim() };
  if (["empresa", "equipe", "proprio"].includes(a.escopo)) return [{ ...base, scope_id: null }];
  return a.alvos.map(scope_id => ({ ...base, scope_id }));
}

/** Grava uma a uma; acesso igual já ativo (chave única) é ignorado. */
async function gravar(linhas: Array<Record<string, unknown>>) {
  for (const linha of linhas) {
    const { error } = await (supabase as any).from("employee_access_profiles").insert(linha);
    if (error && error.code !== "23505") throw error;
  }
}

function validar(a: NovaAtribuicao): string | null {
  if (!a.perfil) return "Escolha o perfil de acesso";
  if (!["empresa", "equipe", "proprio"].includes(a.escopo) && a.alvos.length === 0) return "Escolha onde o acesso vale";
  if (!a.motivo.trim()) return "Informe o motivo da concessão";
  return null;
}

/** Campos de perfil + escopo, usados ao criar usuário e ao incluir acesso. */
function CamposAtribuicao({ valor, onChange, perfis, obras, departamentos, setores }: {
  valor: NovaAtribuicao; onChange: (v: NovaAtribuicao) => void;
  perfis: Perfil[]; obras: Opcao[]; departamentos: Opcao[]; setores: Opcao[];
}) {
  const set = (p: Partial<NovaAtribuicao>) => onChange({ ...valor, ...p });
  const listaAlvo = valor.escopo === "obra" ? obras : valor.escopo === "departamento" ? departamentos : valor.escopo === "setor" ? setores : [];
  const perfilSel = perfis.find(p => p.id === valor.perfil);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Perfil de acesso</Label>
          <Select value={valor.perfil} onValueChange={v => set({ perfil: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{perfis.filter(p => p.ativo).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Onde vale</Label>
          <Select value={valor.escopo} onValueChange={v => set({ escopo: v, alvos: [] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ESCOPOS.map(e => <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {perfilSel?.descricao && <p className="text-xs text-muted-foreground">{perfilSel.descricao}</p>}
      <p className="text-xs text-muted-foreground">{ESCOPOS.find(e => e.valor === valor.escopo)?.ajuda}</p>

      {valor.escopo === "obra" && (
        <div className="max-h-44 overflow-y-auto rounded-lg border">
          {obras.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma obra cadastrada.</p>}
          {obras.map(o => (
            <label key={o.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40">
              <Checkbox checked={valor.alvos.includes(o.id)}
                onCheckedChange={c => set({ alvos: c ? [...valor.alvos, o.id] : valor.alvos.filter(x => x !== o.id) })} />
              <span className="text-sm">{o.nome}</span>
            </label>
          ))}
        </div>
      )}
      {(valor.escopo === "departamento" || valor.escopo === "setor") && (
        <Select value={valor.alvos[0] ?? ""} onValueChange={v => set({ alvos: [v] })}>
          <SelectTrigger><SelectValue placeholder={valor.escopo === "setor" ? "Selecione o setor" : "Selecione o departamento"} /></SelectTrigger>
          <SelectContent>{listaAlvo.map(x => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
        </Select>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label>Motivo</Label>
          <Input value={valor.motivo} onChange={e => set({ motivo: e.target.value })} placeholder="Ex.: gestor responsável pela obra" />
        </div>
        <div className="space-y-1.5">
          <Label>Expira em <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Input type="date" value={valor.validade} onChange={e => set({ validade: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

/**
 * Usuários do sistema: login, funcionário vinculado e acessos (perfil + onde vale).
 * Substitui a antiga aba de usuários em Configurações, que dava acesso pelo cargo.
 */
export function UsuariosAba() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [gerindo, setGerindo] = useState<Usuario | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Criar usuário
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState("");
  const [modo, setModo] = useState<"perfil" | "copiar">("perfil");
  const [copiarDe, setCopiarDe] = useState("");
  const [nova, setNova] = useState<NovaAtribuicao>(atribuicaoVazia());

  // Incluir acesso em usuário existente
  const [inclusao, setInclusao] = useState<NovaAtribuicao>(atribuicaoVazia());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["access-users"],
    queryFn: async () => {
      const [u, f, a, p, o, d, s] = await Promise.all([
        (supabase as any).from("profiles").select("user_id,nome,email").not("user_id", "is", null).order("nome"),
        (supabase as any).from("employees").select("id,nome,user_id,cargos(nome)").order("nome"),
        (supabase as any).from("employee_access_profiles").select("*,access_profiles(nome)").is("revogado_em", null),
        (supabase as any).from("access_profiles").select("id,nome,descricao,ativo").order("nome"),
        (supabase as any).from("obras").select("id,nome").order("nome"),
        (supabase as any).from("departamentos").select("id,nome").order("nome"),
        (supabase as any).from("departamento_setores").select("id,nome").eq("ativo", true).order("nome"),
      ]);
      // Usuários, perfis e atribuições são essenciais. Cadastros auxiliares não
      // podem apagar a lista inteira quando uma relação ainda não foi publicada
      // no cache do banco ou estiver temporariamente indisponível.
      const erroEssencial = u.error || a.error || p.error;
      if (erroEssencial) throw erroEssencial;
      const avisos = [f, o, d, s].filter(x => x.error).map(x => x.error.message);
      return {
        usuarios: u.data as Usuario[], funcionarios: (f.data ?? []) as Funcionario[], atribuicoes: a.data as Atribuicao[],
        perfis: p.data as Perfil[], obras: (o.data ?? []) as Opcao[], departamentos: (d.data ?? []) as Opcao[], setores: (s.data ?? []) as Opcao[], avisos,
      };
    },
  });

  const nomeAlvo = (a: Atribuicao) => {
    if (a.scope_type === "empresa") return "Empresa toda";
    if (a.scope_type === "proprio") return "Próprios registros";
    if (a.scope_type === "equipe") return "Equipe dele";
    const lista = a.scope_type === "obra" ? data?.obras : a.scope_type === "setor" ? data?.setores : data?.departamentos;
    return lista?.find(x => x.id === a.scope_id)?.nome ?? "—";
  };
  const vencido = (a: Atribuicao) => !!a.valido_ate && new Date(a.valido_ate) <= new Date();
  const acessosDe = (userId: string) => (data?.atribuicoes ?? []).filter(a => a.user_id === userId);
  const funcionarioDe = (userId: string) => data?.funcionarios.find(f => f.user_id === userId) ?? null;
  const rotulo = (u: Usuario) => u.nome || u.email || u.user_id;

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (data?.usuarios ?? []).filter(u =>
      !t || (u.nome ?? "").toLowerCase().includes(t) || (u.email ?? "").toLowerCase().includes(t)
      || acessosDe(u.user_id).some(a => (a.access_profiles?.nome ?? "").toLowerCase().includes(t)));
  }, [data, busca]);

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["access-users"] }); qc.invalidateQueries({ queryKey: ["access-control"] }); };

  const limparCriacao = () => {
    setNome(""); setEmail(""); setSenha(""); setFuncionarioId(""); setModo("perfil"); setCopiarDe(""); setNova(atribuicaoVazia());
  };

  const criar = async () => {
    if (!nome.trim() || !email.trim() || senha.length < 6) { toast.error("Informe nome, e-mail e senha com pelo menos 6 caracteres"); return; }
    if (modo === "perfil") { const e = validar(nova); if (e) { toast.error(e); return; } }
    if (modo === "copiar" && !copiarDe) { toast.error("Escolha de quem copiar os acessos"); return; }
    setSalvando(true);
    try {
      const { data: r, error } = await (supabase as any).rpc("create_auth_user", {
        p_email: email.trim(), p_password: senha, p_nome: nome.trim(), p_tipo_acesso: "funcionario",
      });
      if (error) throw error;
      if (!r?.success) throw new Error(r?.error ?? "Não foi possível criar o usuário");
      const userId = r.user_id as string;

      if (funcionarioId) {
        const { error: e } = await (supabase as any).from("employees").update({ user_id: userId }).eq("id", funcionarioId);
        if (e) throw e;
      }

      const origem = data?.usuarios.find(u => u.user_id === copiarDe);
      const linhas = modo === "perfil"
        ? montarLinhas(userId, nova)
        : acessosDe(copiarDe).filter(a => !vencido(a)).map(a => ({
            user_id: userId, profile_id: a.profile_id, scope_type: a.scope_type, scope_id: a.scope_id,
            valido_ate: a.valido_ate, justificativa: `Copiado de ${origem ? rotulo(origem) : "outro usuário"}`,
          }));
      await gravar(linhas);
      toast.success("Usuário criado com os acessos definidos");
      setCriando(false); limparCriacao(); recarregar();
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível criar o usuário");
    } finally {
      setSalvando(false);
    }
  };

  const incluir = async () => {
    if (!gerindo) return;
    const e = validar(inclusao); if (e) { toast.error(e); return; }
    setSalvando(true);
    try {
      await gravar(montarLinhas(gerindo.user_id, inclusao));
      toast.success("Acesso incluído"); setInclusao(atribuicaoVazia()); recarregar();
    } catch (err: any) {
      toast.error(err.message ?? "Não foi possível incluir o acesso");
    } finally {
      setSalvando(false);
    }
  };

  const revogar = async (a: Atribuicao) => {
    if (!confirm(`Revogar "${a.access_profiles?.nome}" (${nomeAlvo(a)})? Fica registrado no histórico.`)) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("employee_access_profiles")
      .update({ revogado_em: new Date().toISOString(), revogado_por: auth.user?.id ?? null }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Acesso revogado"); recarregar();
  };

  const vincularFuncionario = async (userId: string, novoId: string) => {
    const atual = funcionarioDe(userId);
    if (atual && atual.id !== novoId) {
      const { error } = await (supabase as any).from("employees").update({ user_id: null }).eq("id", atual.id);
      if (error) { toast.error(error.message); return; }
    }
    if (novoId) {
      const { error } = await (supabase as any).from("employees").update({ user_id: userId }).eq("id", novoId);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Funcionário vinculado"); recarregar();
  };

  const semVinculo = (data?.funcionarios ?? []).filter(f => !f.user_id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, e-mail ou perfil..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Button onClick={() => setCriando(true)}><UserPlus className="mr-2 h-4 w-4" />Novo usuário</Button>
      </div>

      <Card><CardContent className="p-0"><div className="divide-y">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando...</p>}
        {isError && <div className="flex items-center justify-between gap-3 p-5 text-sm text-destructive"><span><b>Não foi possível carregar os usuários.</b><br/>{error instanceof Error?error.message:"Verifique as permissões e atualizações do banco."}</span><Button variant="outline" size="sm" onClick={()=>refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Tentar novamente</Button></div>}
        {!isError&&data?.avisos.length>0&&<div className="flex items-center gap-2 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle className="h-4 w-4"/>Usuários carregados, mas alguns cadastros auxiliares estão indisponíveis. Atualize o banco para liberar todos os vínculos.</div>}
        {!isLoading && !isError && lista.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
        {lista.map(u => {
          const func = funcionarioDe(u.user_id);
          const acessos = acessosDe(u.user_id);
          return (
            <div key={u.user_id} className="grid items-center gap-3 p-4 md:grid-cols-[1.2fr_1fr_2fr_auto]">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.nome || "Sem nome"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="text-sm">
                {func ? <>{func.nome}{func.cargos?.nome && <span className="block text-xs text-muted-foreground">{func.cargos.nome}</span>}</>
                  : <span className="flex items-center gap-1 text-xs text-amber-600"><AlertCircle className="h-3 w-3" />Sem funcionário</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {acessos.length === 0 && <span className="text-xs text-destructive">Sem acesso</span>}
                {acessos.map(a => (
                  <Badge key={a.id} variant={vencido(a) ? "destructive" : "secondary"} className="font-normal">
                    {a.access_profiles?.nome} · {nomeAlvo(a)}{vencido(a) && " (vencido)"}
                  </Badge>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setGerindo(u); setInclusao(atribuicaoVazia()); }}>
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />Acessos
              </Button>
            </div>
          );
        })}
      </div></CardContent></Card>

      {/* Criar usuário */}
      <Dialog open={criando} onOpenChange={o => { setCriando(o); if (!o) limparCriacao(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Novo usuário</DialogTitle>
            <DialogDescription>Crie o login e defina, no mesmo passo, o que a pessoa pode fazer e onde.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">1. Login</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Nome completo</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <div className="relative">
                    <Input type={verSenha ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" className="pr-10" />
                    <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0" onClick={() => setVerSenha(v => !v)}>
                      {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Funcionário <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Select value={funcionarioId || "__none__"} onValueChange={v => setFuncionarioId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__none__">— Não vincular agora —</SelectItem>
                      {semVinculo.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}{f.cargos?.nome ? ` · ${f.cargos.nome}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">2. Acesso</h3>
                <div className="flex rounded-lg border p-0.5 text-xs">
                  <button type="button" onClick={() => setModo("perfil")} className={`rounded-md px-3 py-1 ${modo === "perfil" ? "bg-primary text-primary-foreground" : ""}`}>Escolher perfil</button>
                  <button type="button" onClick={() => setModo("copiar")} className={`rounded-md px-3 py-1 ${modo === "copiar" ? "bg-primary text-primary-foreground" : ""}`}>Copiar de outro usuário</button>
                </div>
              </div>
              {modo === "perfil" && data && (
                <CamposAtribuicao valor={nova} onChange={setNova} perfis={data.perfis} obras={data.obras} departamentos={data.departamentos} setores={data.setores} />
              )}
              {modo === "copiar" && (
                <div className="space-y-2">
                  <Select value={copiarDe} onValueChange={setCopiarDe}>
                    <SelectTrigger><SelectValue placeholder="Copiar os acessos de..." /></SelectTrigger>
                    <SelectContent className="max-h-56">{(data?.usuarios ?? []).map(u => <SelectItem key={u.user_id} value={u.user_id}>{rotulo(u)}</SelectItem>)}</SelectContent>
                  </Select>
                  {copiarDe && (
                    <div className="flex flex-wrap gap-1.5">
                      {acessosDe(copiarDe).filter(a => !vencido(a)).map(a => <Badge key={a.id} variant="secondary" className="font-normal">{a.access_profiles?.nome} · {nomeAlvo(a)}</Badge>)}
                      {acessosDe(copiarDe).length === 0 && <span className="text-xs text-muted-foreground">Esse usuário não tem acessos para copiar.</span>}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Todo usuário também recebe acesso aos próprios registros (perfil Funcionario).</p>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriando(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={criar} disabled={salvando}>{salvando ? "Criando..." : "Criar usuário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acessos de um usuário */}
      <Dialog open={!!gerindo} onOpenChange={o => { if (!o) setGerindo(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Acessos de {gerindo ? rotulo(gerindo) : ""}</DialogTitle>
            <DialogDescription>{gerindo?.email}</DialogDescription>
          </DialogHeader>
          {gerindo && data && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Funcionário vinculado</Label>
                <Select value={funcionarioDe(gerindo.user_id)?.id ?? "__none__"} onValueChange={v => vincularFuncionario(gerindo.user_id, v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="__none__">— Sem vínculo —</SelectItem>
                    {data.funcionarios.filter(f => !f.user_id || f.user_id === gerindo.user_id)
                      .map(f => <SelectItem key={f.id} value={f.id}>{f.nome}{f.cargos?.nome ? ` · ${f.cargos.nome}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Acessos atuais</h3>
                <div className="divide-y rounded-lg border">
                  {acessosDe(gerindo.user_id).length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum acesso.</p>}
                  {acessosDe(gerindo.user_id).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{a.access_profiles?.nome} <span className="font-normal text-muted-foreground">· {nomeAlvo(a)}</span></p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.valido_ate ? `${vencido(a) ? "Venceu" : "Até"} ${new Date(a.valido_ate).toLocaleDateString("pt-BR")}` : "Sem expiração"}
                          {a.justificativa && ` · ${a.justificativa}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" title="Revogar" onClick={() => revogar(a)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Incluir acesso</h3>
                <CamposAtribuicao valor={inclusao} onChange={setInclusao} perfis={data.perfis} obras={data.obras} departamentos={data.departamentos} setores={data.setores} />
                <div className="flex justify-end"><Button size="sm" onClick={incluir} disabled={salvando}>Incluir</Button></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
