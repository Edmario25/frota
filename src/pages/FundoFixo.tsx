import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wallet, Plus, ArrowDownCircle, ArrowUpCircle,
  DollarSign, Edit, Trash2, MoreHorizontal,
  Eye, Receipt, FileText, Settings2, AlertTriangle, ChevronLeft, ExternalLink,
} from "lucide-react";
import { useFundoFixo } from "@/hooks/useFundoFixo";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserObra } from "@/hooks/useUserObra";
import { useObras } from "@/hooks/useObras";
import { FundoFixoLancamentoModal } from "@/components/fundo-fixo/FundoFixoLancamentoModal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/page-skeleton";

const categoriaLabel: Record<string, string> = {
  alimentacao: "Alimentação",
  transporte:  "Transporte",
  material:    "Material",
  equipamento: "Equipamento",
  hospedagem:  "Hospedagem",
  servico:     "Serviço",
  outros:      "Outros",
};

const categoriaCor: Record<string, string> = {
  alimentacao: "bg-orange-100 text-orange-700",
  transporte:  "bg-blue-100 text-blue-700",
  material:    "bg-yellow-100 text-yellow-700",
  equipamento: "bg-violet-100 text-violet-700",
  hospedagem:  "bg-pink-100 text-pink-700",
  servico:     "bg-teal-100 text-teal-700",
  outros:      "bg-gray-100 text-gray-600",
};

export default function FundoFixo() {
  const { isFuncionario, isGestorObra, hasFullAccess } = useUserRole();
  const { obraId, obraNome } = useUserObra();
  const { obras } = useObras();
  const {
    fundo, lancamentos, allFundos, loading,
    createFundo, updateFundo, createLancamento, updateLancamento, deleteLancamento,
    selectFundo, clearFundo,
  } = useFundoFixo();

  // Admin navegou para dentro de um fundo específico?
  const isAdminDrillDown = hasFullAccess && !!fundo && !isFuncionario && !isGestorObra;

  // Para admin sem obra vinculada: obra selecionada no seletor
  const [adminObraId, setAdminObraId] = useState<string>("");

  const [isLancamentoModalOpen, setIsLancamentoModalOpen] = useState(false);
  const [selectedLancamento, setSelectedLancamento] = useState<any>(null);
  const [isCriarFundoOpen, setIsCriarFundoOpen] = useState(false);
  const [isEditarFundoOpen, setIsEditarFundoOpen] = useState(false);
  const [novoFundoNome, setNovoFundoNome] = useState("Fundo Fixo");
  const [novoFundoSaldo, setNovoFundoSaldo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [verDetalhe, setVerDetalhe] = useState<any>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entrada" | "saida">("todos");

  // Stats
  const totalEntradas = lancamentos.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const totalSaidas   = lancamentos.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const lancamentosFiltrados = lancamentos.filter(l =>
    filtroTipo === "todos" ? true : l.tipo === filtroTipo
  );

  const handleCriarFundo = async () => {
    const targetObraId = obraId || adminObraId;
    if (!targetObraId) return;
    setIsSaving(true);
    try {
      await createFundo({
        obra_id: targetObraId,
        nome: novoFundoNome || "Fundo Fixo",
        saldo_inicial: parseFloat(novoFundoSaldo) || 0,
      });
      setIsCriarFundoOpen(false);
      setAdminObraId("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAtualizarFundo = async () => {
    if (!fundo) return;
    setIsSaving(true);
    try {
      await updateFundo(fundo.id, {
        nome: novoFundoNome,
        saldo_inicial: parseFloat(novoFundoSaldo) || 0,
      });
      setIsEditarFundoOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <PageSkeleton statsCount={4} columns={5} rows={6} />;

  return (
    <Layout>
      <div className="space-y-6 max-w-screen-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            {/* Botão voltar — só aparece quando admin entrou num fundo específico */}
            {isAdminDrillDown && (
              <button
                onClick={clearFundo}
                className="mt-0.5 h-8 w-8 rounded-lg border border-border/60 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                title="Voltar para lista de fundos"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                {isAdminDrillDown && fundo
                  ? fundo.nome
                  : "Fundo Fixo"
                }
                {obraNome && !isAdminDrillDown && (
                  <Badge variant="outline" className="text-xs font-normal ml-1">{obraNome}</Badge>
                )}
                {isAdminDrillDown && (fundo as any)?.obras?.nome && (
                  <Badge variant="outline" className="text-xs font-normal ml-1">{(fundo as any).obras.nome}</Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isAdminDrillDown
                  ? "Gerenciar lançamentos e saldo do fundo"
                  : "Caixa para despesas emergenciais da obra"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {fundo && (isGestorObra || hasFullAccess) && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  setNovoFundoNome(fundo.nome);
                  setNovoFundoSaldo(fundo.saldo_inicial.toString());
                  setIsEditarFundoOpen(true);
                }}>
                  <Settings2 className="h-4 w-4 mr-1.5" />
                  Configurar Fundo
                </Button>
                <Button size="sm" onClick={() => { setSelectedLancamento(null); setIsLancamentoModalOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo Lançamento
                </Button>
              </>
            )}
            {fundo && isFuncionario && (
              <Button size="sm" onClick={() => { setSelectedLancamento(null); setIsLancamentoModalOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar Despesa
              </Button>
            )}
          </div>
        </div>

        {/* Sem fundo criado (para a obra atual do usuário) */}
        {!fundo && !hasFullAccess && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">Nenhum fundo fixo criado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isGestorObra
                    ? "Crie o fundo fixo para esta obra para começar a registrar despesas."
                    : "O gestor desta obra ainda não criou um fundo fixo."}
                </p>
              </div>
              {isGestorObra && obraId && (
                <Button onClick={() => setIsCriarFundoOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Fundo Fixo
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Visão admin: lista todos os fundos de todas as obras */}
        {hasFullAccess && !fundo && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Todos os fundos fixos cadastrados no sistema</p>
              <Button onClick={() => { setNovoFundoNome("Fundo Fixo"); setNovoFundoSaldo(""); setIsCriarFundoOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Fundo para Obra
              </Button>
            </div>
            {allFundos.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Wallet className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-lg">Nenhum fundo fixo cadastrado</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Crie fundos fixos para as obras para começar a registrar despesas.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {allFundos.map((f: any) => {
                  const saldoBaixo = f.saldo_atual >= 0 && f.saldo_atual < f.saldo_inicial * 0.2;
                  return (
                    <Card
                      key={f.id}
                      onClick={() => selectFundo(f)}
                      className={cn(
                        "border-l-4 cursor-pointer hover:shadow-md transition-shadow group",
                        f.saldo_atual < 0 ? "border-l-red-500" :
                        saldoBaixo ? "border-l-amber-500" :
                        "border-l-green-500"
                      )}
                    >
                      <CardContent className="pt-4 pb-3 space-y-1">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{f.nome}</p>
                            <p className="text-xs text-muted-foreground truncate">{f.obras?.nome ?? "—"}</p>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5 ml-2" />
                        </div>
                        <p className={cn("text-xl font-extrabold",
                          f.saldo_atual < 0 ? "text-red-600" :
                          saldoBaixo ? "text-amber-600" :
                          "text-green-600"
                        )}>
                          R$ {Number(f.saldo_atual).toFixed(2)}
                        </p>
                        <div className="flex items-center justify-between">
                          {saldoBaixo ? (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />Saldo baixo
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Inicial: R$ {Number(f.saldo_inicial).toFixed(2)}
                            </p>
                          )}
                          <p className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Abrir →
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Fundo criado */}
        {fundo && (
          <>
            {/* Cards de resumo */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Saldo Atual */}
              <Card className={cn(
                "border-l-4",
                fundo.saldo_atual < 0 ? "border-l-red-500" :
                fundo.saldo_atual < fundo.saldo_inicial * 0.2 ? "border-l-amber-500" :
                "border-l-green-500"
              )}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo Atual</p>
                  <p className={cn("text-2xl font-extrabold mt-1",
                    fundo.saldo_atual < 0 ? "text-red-600" :
                    fundo.saldo_atual < fundo.saldo_inicial * 0.2 ? "text-amber-600" :
                    "text-green-600"
                  )}>
                    R$ {fundo.saldo_atual.toFixed(2)}
                  </p>
                  {fundo.saldo_atual < fundo.saldo_inicial * 0.2 && fundo.saldo_atual >= 0 && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />Saldo baixo
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Saldo Inicial */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo Inicial</p>
                  <p className="text-2xl font-extrabold mt-1">R$ {fundo.saldo_inicial.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fundo.nome}</p>
                </CardContent>
              </Card>

              {/* Total Saídas */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Saídas</p>
                  <p className="text-2xl font-extrabold mt-1 text-red-600">R$ {totalSaidas.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lancamentos.filter(l => l.tipo === "saida").length} lançamentos
                  </p>
                </CardContent>
              </Card>

              {/* Total Entradas */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Entradas</p>
                  <p className="text-2xl font-extrabold mt-1 text-green-600">R$ {totalEntradas.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lancamentos.filter(l => l.tipo === "entrada").length} reposições
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
              {(["todos", "saida", "entrada"] as const).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filtroTipo === f ? "default" : "outline"}
                  onClick={() => setFiltroTipo(f)}
                  className="gap-1.5"
                >
                  {f === "todos" && <DollarSign className="h-3.5 w-3.5" />}
                  {f === "saida" && <ArrowDownCircle className="h-3.5 w-3.5" />}
                  {f === "entrada" && <ArrowUpCircle className="h-3.5 w-3.5" />}
                  {f === "todos" ? "Todos" : f === "saida" ? "Saídas" : "Entradas"}
                </Button>
              ))}
            </div>

            {/* Tabela de lançamentos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lançamentos</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Docs</TableHead>
                      <TableHead className="w-[60px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lancamentosFiltrados.map(lanc => (
                      <TableRow key={lanc.id}>
                        <TableCell className="text-sm">
                          {format(new Date(lanc.data_lancamento), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {lanc.tipo === "saida" ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
                              <ArrowDownCircle className="h-3.5 w-3.5" />Saída
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                              <ArrowUpCircle className="h-3.5 w-3.5" />Entrada
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">{lanc.descricao}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs border-0",
                            categoriaCor[lanc.categoria ?? "outros"] ?? categoriaCor.outros
                          )}>
                            {categoriaLabel[lanc.categoria ?? "outros"] ?? "Outros"}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold",
                          lanc.tipo === "saida" ? "text-red-600" : "text-green-600"
                        )}>
                          {lanc.tipo === "saida" ? "−" : "+"}R$ {lanc.valor.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {lanc.recibo_url && (
                              <a href={lanc.recibo_url} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground" title="Ver recibo">
                                <Receipt className="h-4 w-4" />
                              </a>
                            )}
                            {lanc.nf_url && (
                              <a href={lanc.nf_url} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground" title="Ver NF">
                                <FileText className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setVerDetalhe(lanc)}>
                                <Eye className="h-4 w-4 mr-2" />Ver detalhes
                              </DropdownMenuItem>
                              {(isGestorObra || hasFullAccess) && (
                                <>
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedLancamento(lanc);
                                    setIsLancamentoModalOpen(true);
                                  }}>
                                    <Edit className="h-4 w-4 mr-2" />Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => deleteLancamento(lanc.id)}>
                                    <Trash2 className="h-4 w-4 mr-2" />Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {lancamentosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                          <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          Nenhum lançamento registrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

      </div>

      {/* Modal: Criar fundo */}
      <Dialog open={isCriarFundoOpen} onOpenChange={setIsCriarFundoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar Fundo Fixo</DialogTitle>
            <DialogDescription>Defina a obra, o nome e o saldo inicial do caixa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Seletor de obra — só para admin sem obra vinculada */}
            {hasFullAccess && !obraId && (
              <div className="space-y-2">
                <Label>Obra</Label>
                <Select value={adminObraId} onValueChange={setAdminObraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {obras
                      .filter((o: any) => o.status === "em_andamento" || o.status === "planejamento")
                      .map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nome do Fundo</Label>
              <Input value={novoFundoNome} onChange={e => setNovoFundoNome(e.target.value)} placeholder="Ex: Fundo Fixo Obra X" />
            </div>
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" step="0.01" value={novoFundoSaldo}
                onChange={e => setNovoFundoSaldo(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCriarFundoOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCriarFundo}
              disabled={isSaving || (hasFullAccess && !obraId && !adminObraId)}
            >
              {isSaving ? "Criando..." : "Criar Fundo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar fundo */}
      <Dialog open={isEditarFundoOpen} onOpenChange={setIsEditarFundoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar Fundo Fixo</DialogTitle>
            <DialogDescription>Ajuste o nome e o saldo inicial. O saldo atual será recalculado automaticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={novoFundoNome} onChange={e => setNovoFundoNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" step="0.01" value={novoFundoSaldo} onChange={e => setNovoFundoSaldo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditarFundoOpen(false)}>Cancelar</Button>
            <Button onClick={handleAtualizarFundo} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe lançamento */}
      <Dialog open={!!verDetalhe} onOpenChange={() => setVerDetalhe(null)}>
        {verDetalhe && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Detalhe do Lançamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Tipo</p>
                  <p className={cn("font-semibold", verDetalhe.tipo === "saida" ? "text-red-600" : "text-green-600")}>
                    {verDetalhe.tipo === "saida" ? "Saída" : "Entrada"}
                  </p>
                </div>
                <div><p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-semibold">R$ {Number(verDetalhe.valor).toFixed(2)}</p>
                </div>
                <div><p className="text-xs text-muted-foreground">Data</p>
                  <p>{format(new Date(verDetalhe.data_lancamento), "dd/MM/yyyy", { locale: ptBR })}</p>
                </div>
                <div><p className="text-xs text-muted-foreground">Categoria</p>
                  <p>{categoriaLabel[verDetalhe.categoria] ?? "Outros"}</p>
                </div>
              </div>
              <div><p className="text-xs text-muted-foreground">Descrição</p>
                <p>{verDetalhe.descricao}</p>
              </div>
              {verDetalhe.observacoes && (
                <div><p className="text-xs text-muted-foreground">Observações</p>
                  <p>{verDetalhe.observacoes}</p>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                {verDetalhe.recibo_url && (
                  <a href={verDetalhe.recibo_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary text-xs font-medium hover:underline">
                    <Receipt className="h-3.5 w-3.5" />Ver Recibo
                  </a>
                )}
                {verDetalhe.nf_url && (
                  <a href={verDetalhe.nf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary text-xs font-medium hover:underline">
                    <FileText className="h-3.5 w-3.5" />Ver Nota Fiscal
                  </a>
                )}
                {!verDetalhe.recibo_url && !verDetalhe.nf_url && (
                  <p className="text-xs text-muted-foreground italic">Nenhum documento anexado</p>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Modal de lançamento */}
      {fundo && (
        <FundoFixoLancamentoModal
          open={isLancamentoModalOpen}
          onOpenChange={setIsLancamentoModalOpen}
          fundoId={fundo.id}
          apenasGestores={isFuncionario}
          lancamento={selectedLancamento}
          onSubmit={async (data) => {
            if (selectedLancamento) {
              await updateLancamento(selectedLancamento.id, data);
            } else {
              await createLancamento(data);
            }
          }}
        />
      )}
    </Layout>
  );
}
