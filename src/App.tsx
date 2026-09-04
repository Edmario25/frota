import { Toaster } from "@/components/ui/toaster";
import { T, useI18n } from "@/i18n";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from "react";

// ─── Error Boundary global — evita tela branca em crashes ────────────────────
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-background text-foreground">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold"><T>Ocorreu um erro inesperado</T></h1>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            {this.state.error.message}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <T>Voltar ao início</T>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import Auth from "./pages/Auth";
import { loadBrandingFromDB } from "./hooks/useSystemSettings";

const Index = lazy(() => import("./pages/Index"));
const Funcionarios = lazy(() => import("./pages/Funcionarios"));
const Cargos = lazy(() => import("./pages/Cargos"));
const Frota = lazy(() => import("./pages/Frota"));
const Manutencao = lazy(() => import("./pages/Manutencao"));
const Escalas = lazy(() => import("./pages/Escalas"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Acessorios = lazy(() => import("./pages/Acessorios"));
const TesteFumaca = lazy(() => import("./pages/TesteFumaca"));
const ChecklistInspecao = lazy(() => import("./pages/ChecklistInspecao"));
const Borracharia = lazy(() => import("./pages/Borracharia"));
const Multas = lazy(() => import("./pages/Multas"));
const VeiculosPesados = lazy(() => import("./pages/VeiculosPesados"));
const Obras = lazy(() => import("./pages/Obras"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const MinhasInformacoes = lazy(() => import("./pages/MinhasInformacoes"));
const Consultas = lazy(() => import("./pages/Consultas"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Departamentos = lazy(() => import("./pages/Departamentos"));
const FundoFixo = lazy(() => import("./pages/FundoFixo"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const RelatorioEscalas = lazy(() => import("./pages/RelatorioEscalas"));
const RelatorioFolha = lazy(() => import("./pages/RelatorioFolha"));
const Chat = lazy(() => import("./pages/Chat"));
const MobileApp = lazy(() => import("./pages/app/MobileApp"));
const AppSms = lazy(() => import("./pages/app/AppSms"));
const AppCampo = lazy(() => import("./pages/app/campo/AppCampo"));
const AppAlmoxarifado = lazy(() => import("./pages/app/almoxarifado/AppAlmoxarifado"));
const SmsDashboard = lazy(() => import("./pages/sms/SmsDashboard"));
const SmsDesvios = lazy(() => import("./pages/sms/SmsDesvios"));
const SmsInspecoes = lazy(() => import("./pages/sms/SmsInspecoes"));
const SmsDds = lazy(() => import("./pages/sms/SmsDds"));
const SmsApr = lazy(() => import("./pages/sms/SmsApr"));
const SmsEpis = lazy(() => import("./pages/sms/SmsEpis"));
const SmsTreinamentos = lazy(() => import("./pages/sms/SmsTreinamentos"));
const SmsConformidade = lazy(() => import("./pages/sms/SmsConformidade"));
const SmsAdmissao = lazy(() => import("./pages/sms/SmsAdmissao"));
const SmsRdo = lazy(() => import("./pages/sms/SmsRdo"));
const SmsOcorrencias = lazy(() => import("./pages/sms/SmsOcorrencias"));
const SmsGestaoLegal = lazy(() => import("./pages/sms/SmsGestaoLegal"));
const Efetivo = lazy(() => import("./pages/Efetivo"));
const EfetivoRelatorio = lazy(() => import("./pages/EfetivoRelatorio"));
const PontoQr = lazy(() => import("./pages/PontoQr"));
const Almoxarifado = lazy(() => import("./pages/Almoxarifado"));
const Ferramentas = lazy(() => import("./pages/Ferramentas"));
const Cronograma = lazy(() => import("./pages/Cronograma"));
const Subcontratadas = lazy(() => import("./pages/Subcontratadas"));
const OrcadoRealizado = lazy(() => import("./pages/OrcadoRealizado"));
const PortalCliente = lazy(() => import("./pages/PortalCliente"));
const PortalPublico = lazy(() => import("./pages/PortalPublico"));
const NaoConformidades = lazy(() => import("./pages/NaoConformidades"));
const Qualidade = lazy(() => import("./pages/Qualidade"));
const QualidadeRegistros = lazy(() => import("./pages/QualidadeRegistros"));
const Comunicados = lazy(() => import("./pages/Comunicados"));
const Visitantes = lazy(() => import("./pages/Visitantes"));
const Auditoria = lazy(() => import("./pages/Auditoria"));

const RouteFallback = () => {
  const { t } = useI18n();
  return (
  <div className="min-h-screen flex items-center justify-center" role="status" aria-label={t("Carregando...")}>
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
  );
};

// 1. Aplica favicon do localStorage imediatamente (sem esperar rede)
try {
  const raw = localStorage.getItem("fleet_settings");
  if (raw) {
    const settings = JSON.parse(raw);
    if (settings?.iconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = settings.iconUrl;
    }
  }
} catch { /* ignora */ }

// 2. Carrega branding do Supabase em background e aplica favicon/logo para todos os usuários
loadBrandingFromDB().then((s) => {
  if (s.iconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = s.iconUrl;
  }
});

const App = () => (
  <AppErrorBoundary>
  <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/portal-publico/:token" element={<PortalPublico />} />
            <Route path="/app-almoxarifado" element={<AppAlmoxarifado />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/funcionarios" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Funcionarios />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/cargos" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota']}>
                  <Cargos />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/frota" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Frota />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/manutencao" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <Manutencao />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/escalas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Escalas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/acessorios" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <Acessorios />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/teste-fumaca" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <TesteFumaca />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/checklist-inspecao" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <ChecklistInspecao />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/borracharia" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <Borracharia />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/multas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <Multas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/veiculos-pesados" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <VeiculosPesados />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/obras" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Obras />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/fornecedores" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Fornecedores />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/minhas-informacoes" element={
              <ProtectedRoute>
                <MinhasInformacoes />
              </ProtectedRoute>
            } />
            <Route path="/consultas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Consultas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/relatorios" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Relatorios />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/relatorios-escala" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <RelatorioEscalas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/relatorio-folha" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota']}>
                  <RelatorioFolha />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/departamentos" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota']}>
                  <Departamentos />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/configuracoes" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin']}>
                  <Configuracoes />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/fundo-fixo" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <FundoFixo />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/chat" element={
              <ProtectedRoute>
                {/* Chat restrito a gestor_obra (por obra) e admin — gestor_contrato sem acesso */}
                <RoleProtectedRoute allowedRoles={['gestor_obra', 'admin']}>
                  <Chat />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            {/* ── Efetivo e Ponto ─────────────────────────────────── */}
            <Route path="/efetivo" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Efetivo />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/efetivo/relatorio" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <EfetivoRelatorio />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/ponto-qr" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <PontoQr />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/almoxarifado" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Almoxarifado />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/ferramentas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Ferramentas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/cronograma" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Cronograma />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/subcontratadas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Subcontratadas />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/orcado-realizado" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <OrcadoRealizado />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/portal-cliente" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <PortalCliente />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/nao-conformidades" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <NaoConformidades />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/qualidade" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Qualidade />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/qualidade/:modulo" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <QualidadeRegistros />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/comunicados" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'funcionario']}>
                  <Comunicados />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/visitantes" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
                  <Visitantes />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            {/* ── SMS / SSMA ──────────────────────────────────────── */}
            <Route path="/sms" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsDashboard />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/desvios" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsDesvios />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/ocorrencias" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsOcorrencias />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/gestao-legal" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsGestaoLegal />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/inspecoes" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsInspecoes />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/dds" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsDds />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/apr" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsApr />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/epis" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsEpis />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/treinamentos" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsTreinamentos />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/conformidade" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsConformidade />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/admissao" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsAdmissao />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/sms/rdo" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra', 'tecnico_sms']}>
                  <SmsRdo />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            {/* /app gerencia seu próprio auth — não usa ProtectedRoute */}
            <Route path="/auditoria" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <Auditoria />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/app" element={<MobileApp />} />
            <Route path="/app-sms" element={<AppSms />} />
            <Route path="/app-campo" element={<AppCampo />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
  </AppErrorBoundary>
);

export default App;
