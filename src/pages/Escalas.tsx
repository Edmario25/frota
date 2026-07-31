import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, Plus, Edit, Trash2, Settings, AlertTriangle, CheckCircle, Briefcase, Coffee } from "lucide-react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEscalas, EscalaTipo, EscalaPeriodo } from "@/hooks/useEscalas";
import { EscalaTipoFormModal } from "@/components/escalas/EscalaTipoFormModal";
import { EscalaPeriodoFormModal } from "@/components/escalas/EscalaPeriodoFormModal";
import { ConfirmDeleteModal } from "@/components/escalas/ConfirmDeleteModal";

// ─── View do funcionário: mostra apenas os próprios períodos ───────────────
const MinhaEscalaView = () => {
  const { user } = useAuth();
  const [periodos, setPeriodos] = useState<EscalaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      // descobrir o employee_id do usuário logado
      const { data: emp } = await supabase
        .from('employees')
        .select('id, escala_tipo_id, escala_tipos:escala_tipo_id(nome, dias_trabalho, dias_folga)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!emp) { setLoading(false); return; }

      const { data } = await supabase
        .from('escala_periodos')
        .select(`
          *,
          escala_tipo:escala_tipo_id(nome, dias_trabalho, dias_folga)
        `)
        .eq('employee_id', emp.id)
        .order('data_inicio_trabalho', { ascending: false });

      setPeriodos((data as any) || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const hoje = new Date();

  const periodoAtual = periodos.find(p => {
    try {
      return isWithinInterval(hoje, {
        start: parseISO(p.data_inicio_trabalho),
        end: parseISO(p.data_fim_folga),
      });
    } catch { return false; }
  });

  const proximoPeriodo = periodos.find(p => parseISO(p.data_inicio_trabalho) > hoje);

  const emFolga = periodoAtual
    ? isWithinInterval(hoje, {
        start: parseISO(periodoAtual.data_inicio_folga),
        end: parseISO(periodoAtual.data_fim_folga),
      })
    : false;

  const getStatusBadge = (p: EscalaPeriodo) => {
    if (p.conflito_detectado && !p.conflito_autorizado)
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Conflito</Badge>;
    if (p.conflito_detectado && p.conflito_autorizado)
      return <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Autorizado</Badge>;
    if (emFolga && periodoAtual?.id === p.id)
      return <Badge className="bg-blue-100 text-blue-700 border-0"><Coffee className="h-3 w-3 mr-1" />Em Folga</Badge>;
    if (periodoAtual?.id === p.id)
      return <Badge className="bg-emerald-100 text-emerald-700 border-0"><Briefcase className="h-3 w-3 mr-1" />Trabalhando</Badge>;
    if (parseISO(p.data_inicio_trabalho) > hoje)
      return <Badge variant="outline">Agendado</Badge>;
    return <Badge variant="secondary">Concluído</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted-foreground">Carregando escala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-screen-md mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-foreground tracking-tight">Minha Escala</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Acompanhe seus períodos de trabalho e folga</p>
      </div>

      {/* Status atual */}
      {periodoAtual ? (
        <Card className={`border-2 ${emFolga ? 'border-blue-300 bg-blue-50/50' : 'border-emerald-300 bg-emerald-50/50'}`}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-4">
              {emFolga
                ? <Coffee className="h-8 w-8 text-blue-600" />
                : <Briefcase className="h-8 w-8 text-emerald-600" />}
              <div>
                <p className={`text-lg font-bold ${emFolga ? 'text-blue-700' : 'text-emerald-700'}`}>
                  {emFolga ? 'Você está de folga' : 'Você está trabalhando'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Escala: {(periodoAtual as any).escala_tipo?.nome ?? '—'}
                  {(periodoAtual as any).escala_tipo && ` (${(periodoAtual as any).escala_tipo.dias_trabalho}x${(periodoAtual as any).escala_tipo.dias_folga})`}
                </p>
              </div>
            </div>

            <Separator className="mb-4" />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground font-medium mb-1 flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> Período de Trabalho
                </p>
                <p className="font-semibold">
                  {format(parseISO(periodoAtual.data_inicio_trabalho), "dd 'de' MMM", { locale: ptBR })} →{' '}
                  {format(parseISO(periodoAtual.data_fim_trabalho), "dd 'de' MMM", { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1 flex items-center gap-1">
                  <Coffee className="h-3.5 w-3.5" /> Período de Folga
                </p>
                <p className="font-semibold">
                  {format(parseISO(periodoAtual.data_inicio_folga), "dd 'de' MMM", { locale: ptBR })} →{' '}
                  {format(parseISO(periodoAtual.data_fim_folga), "dd 'de' MMM", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Dias restantes */}
            {!emFolga && (() => {
              const diasParaFolga = Math.ceil((parseISO(periodoAtual.data_inicio_folga).getTime() - hoje.getTime()) / 86400000);
              return diasParaFolga > 0 ? (
                <div className="mt-4 rounded-lg bg-white/60 border border-emerald-200 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Folga começa em</p>
                  <p className="text-2xl font-extrabold text-emerald-700">
                    {diasParaFolga === 1 ? 'Amanhã' : `${diasParaFolga} dias`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(periodoAtual.data_inicio_folga), "dd/MM/yyyy")}
                  </p>
                </div>
              ) : null;
            })()}

            {emFolga && (() => {
              const diasRetorno = Math.ceil((parseISO(periodoAtual.data_fim_folga).getTime() - hoje.getTime()) / 86400000);
              return (
                <div className="mt-4 rounded-lg bg-white/60 border border-blue-200 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Retorno ao trabalho em</p>
                  <p className="text-2xl font-extrabold text-blue-700">
                    {diasRetorno <= 0 ? 'Hoje' : diasRetorno === 1 ? 'Amanhã' : `${diasRetorno} dias`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(periodoAtual.data_fim_folga), "dd/MM/yyyy")}
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-muted-foreground">Nenhum período de escala ativo no momento</p>
          </CardContent>
        </Card>
      )}

      {/* Histórico de períodos */}
      {periodos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico de Períodos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trabalho</TableHead>
                  <TableHead>Folga</TableHead>
                  <TableHead>Escala</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {format(parseISO(p.data_inicio_trabalho), "dd/MM/yy", { locale: ptBR })} –{' '}
                      {format(parseISO(p.data_fim_trabalho), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(parseISO(p.data_inicio_folga), "dd/MM/yy", { locale: ptBR })} –{' '}
                      {format(parseISO(p.data_fim_folga), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(p as any).escala_tipo?.nome ?? '—'}
                    </TableCell>
                    <TableCell>{getStatusBadge(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── View do gestor: visão completa ────────────────────────────────────────
const Escalas = () => {
  const { hasEscalaManagement, isFuncionario } = useUserRole();
  const { escalaTipos, escalaPeriodos, loading, deleteEscalaTipo, deleteEscalaPeriodo } = useEscalas();

  // Funcionário vê apenas a própria escala
  if (isFuncionario) {
    return (
      <Layout>
        <MinhaEscalaView />
      </Layout>
    );
  }
  
  const [activeTab, setActiveTab] = useState("periodos");
  const [tipoModalOpen, setTipoModalOpen] = useState(false);
  const [periodoModalOpen, setPeriodoModalOpen] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<EscalaTipo | null>(null);
  const [selectedPeriodo, setSelectedPeriodo] = useState<EscalaPeriodo | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'tipo' | 'periodo'; id: string; name: string } | null>(null);

  const handleEditTipo = (tipo: EscalaTipo) => {
    setSelectedTipo(tipo);
    setTipoModalOpen(true);
  };

  const handleEditPeriodo = (periodo: EscalaPeriodo) => {
    setSelectedPeriodo(periodo);
    setPeriodoModalOpen(true);
  };

  const handleDeleteClick = (type: 'tipo' | 'periodo', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      if (deleteTarget.type === 'tipo') {
        await deleteEscalaTipo(deleteTarget.id);
      } else {
        await deleteEscalaPeriodo(deleteTarget.id);
      }
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const getStatusBadge = (periodo: EscalaPeriodo) => {
    if (periodo.conflito_detectado && !periodo.conflito_autorizado) {
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Conflito</Badge>;
    }
    if (periodo.conflito_detectado && periodo.conflito_autorizado) {
      return <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Autorizado</Badge>;
    }
    if (periodo.status === 'agendado') {
      return <Badge variant="outline">Agendado</Badge>;
    }
    return <Badge>{periodo.status}</Badge>;
  };

  // Stats calculations
  const periodosAtivos = escalaPeriodos.filter(p => {
    const hoje = new Date();
    const inicioFolga = new Date(p.data_inicio_folga);
    const fimFolga = new Date(p.data_fim_folga);
    return hoje >= inicioFolga && hoje <= fimFolga;
  }).length;

  const periodosAgendados = escalaPeriodos.filter(p => p.status === 'agendado').length;
  const conflitos = escalaPeriodos.filter(p => p.conflito_detectado && !p.conflito_autorizado).length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Escalas</h1>
            <p className="text-muted-foreground">
              Gerencie as escalas de trabalho e folgas da equipe
            </p>
          </div>
          {hasEscalaManagement && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}>
                <Settings className="mr-2 h-4 w-4" />
                Tipos de Escala
              </Button>
              <Button className="gradient-primary" onClick={() => { setSelectedPeriodo(null); setPeriodoModalOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Período
              </Button>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tipos de Escala</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{escalaTipos.length}</div>
              <p className="text-xs text-muted-foreground">Configurados</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Períodos Agendados</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodosAgendados}</div>
              <p className="text-xs text-muted-foreground">Aguardando</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Em Folga Hoje</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodosAtivos}</div>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conflitos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conflitos}</div>
              <p className="text-xs text-muted-foreground">Não autorizados</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="periodos">Períodos de Escala</TabsTrigger>
            <TabsTrigger value="tipos">Tipos de Escala</TabsTrigger>
          </TabsList>

          <TabsContent value="periodos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Períodos Agendados</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : escalaPeriodos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="mx-auto h-12 w-12 mb-4" />
                    <p>Nenhum período de escala cadastrado</p>
                    {hasEscalaManagement && (
                      <Button 
                        className="mt-4" 
                        variant="outline"
                        onClick={() => { setSelectedPeriodo(null); setPeriodoModalOpen(true); }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeiro Período
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionário</TableHead>
                        <TableHead>Escala</TableHead>
                        <TableHead>Trabalho</TableHead>
                        <TableHead>Folga</TableHead>
                        <TableHead>Status</TableHead>
                        {hasEscalaManagement && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalaPeriodos.map((periodo) => (
                        <TableRow key={periodo.id}>
                          <TableCell className="font-medium">{periodo.employee?.nome}</TableCell>
                          <TableCell>{periodo.escala_tipo?.nome}</TableCell>
                          <TableCell>
                            {format(new Date(periodo.data_inicio_trabalho), "dd/MM/yy", { locale: ptBR })} - {format(new Date(periodo.data_fim_trabalho), "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {format(new Date(periodo.data_inicio_folga), "dd/MM/yy", { locale: ptBR })} - {format(new Date(periodo.data_fim_folga), "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{getStatusBadge(periodo)}</TableCell>
                          {hasEscalaManagement && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEditPeriodo(periodo)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteClick('periodo', periodo.id, periodo.employee?.nome || '')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tipos" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Tipos de Escala</CardTitle>
                {hasEscalaManagement && (
                  <Button onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Tipo
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : escalaTipos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="mx-auto h-12 w-12 mb-4" />
                    <p>Nenhum tipo de escala cadastrado</p>
                    {hasEscalaManagement && (
                      <Button 
                        className="mt-4" 
                        variant="outline"
                        onClick={() => { setSelectedTipo(null); setTipoModalOpen(true); }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeiro Tipo
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Dias Trabalho</TableHead>
                        <TableHead>Dias Folga</TableHead>
                        <TableHead>Sobreposição</TableHead>
                        <TableHead>Descrição</TableHead>
                        {hasEscalaManagement && <TableHead className="text-right">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalaTipos.map((tipo) => (
                        <TableRow key={tipo.id}>
                          <TableCell className="font-medium">{tipo.nome}</TableCell>
                          <TableCell>{tipo.dias_trabalho}</TableCell>
                          <TableCell>{tipo.dias_folga}</TableCell>
                          <TableCell>
                            {tipo.permite_sobreposicao ? (
                              <Badge variant="secondary">Permitida</Badge>
                            ) : (
                              <Badge variant="outline">Não Permitida</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{tipo.descricao || "-"}</TableCell>
                          {hasEscalaManagement && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEditTipo(tipo)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteClick('tipo', tipo.id, tipo.nome)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <EscalaTipoFormModal
        isOpen={tipoModalOpen}
        onClose={() => { setTipoModalOpen(false); setSelectedTipo(null); }}
        escalaTipo={selectedTipo}
      />

      <EscalaPeriodoFormModal
        isOpen={periodoModalOpen}
        onClose={() => { setPeriodoModalOpen(false); setSelectedPeriodo(null); }}
        periodo={selectedPeriodo}
      />

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleConfirmDelete}
        title={`Excluir ${deleteTarget?.type === 'tipo' ? 'Tipo de Escala' : 'Período'}`}
        description={`Tem certeza que deseja excluir ${deleteTarget?.type === 'tipo' ? 'o tipo de escala' : 'o período de'} "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
      />
    </Layout>
  );
};

export default Escalas;
