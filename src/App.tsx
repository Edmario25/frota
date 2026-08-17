import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { Component, type ErrorInfo, type ReactNode } from "react";

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
          <h1 className="text-xl font-bold">Ocorreu um erro inesperado</h1>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            {this.state.error.message}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Voltar ao início
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";
import Index from "./pages/Index";
import Funcionarios from "./pages/Funcionarios";
import Cargos from "./pages/Cargos";
import Frota from "./pages/Frota";
import Manutencao from "./pages/Manutencao";
import Escalas from "./pages/Escalas";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Acessorios from "./pages/Acessorios";
import TesteFumaca from "./pages/TesteFumaca";
import ChecklistInspecao from "./pages/ChecklistInspecao";
import Borracharia from "./pages/Borracharia";
import Multas from "./pages/Multas";
import VeiculosPesados from "./pages/VeiculosPesados";
import Obras from "./pages/Obras";
import Fornecedores from "./pages/Fornecedores";
import MinhasInformacoes from "./pages/MinhasInformacoes";
import Consultas from "./pages/Consultas";
import Configuracoes from "./pages/Configuracoes";
import Departamentos from "./pages/Departamentos";
import FundoFixo from "./pages/FundoFixo";
import Relatorios from "./pages/Relatorios";
import RelatorioEscalas from "./pages/RelatorioEscalas";
import RelatorioFolha from "./pages/RelatorioFolha";
import Chat from "./pages/Chat";
import MobileApp from "./pages/app/MobileApp";
import AppSms from "./pages/app/AppSms";
import AppCampo from "./pages/app/campo/AppCampo";
import SmsDashboard from "./pages/sms/SmsDashboard";
import SmsDesvios from "./pages/sms/SmsDesvios";
import SmsInspecoes from "./pages/sms/SmsInspecoes";
import SmsDds from "./pages/sms/SmsDds";
import SmsApr from "./pages/sms/SmsApr";
import SmsEpis from "./pages/sms/SmsEpis";
import SmsTreinamentos from "./pages/sms/SmsTreinamentos";
import SmsConformidade from "./pages/sms/SmsConformidade";
import SmsAdmissao from "./pages/sms/SmsAdmissao";
import SmsRdo from "./pages/sms/SmsRdo";
import Efetivo from "./pages/Efetivo";
import EfetivoRelatorio from "./pages/EfetivoRelatorio";
import PontoQr from "./pages/PontoQr";
import Almoxarifado from "./pages/Almoxarifado";
import Ferramentas from "./pages/Ferramentas";
import Cronograma from "./pages/Cronograma";
import Subcontratadas from "./pages/Subcontratadas";
import OrcadoRealizado from "./pages/OrcadoRealizado";
import PortalCliente from "./pages/PortalCliente";
import NaoConformidades from "./pages/NaoConformidades";
import Comunicados from "./pages/Comunicados";
import Visitantes from "./pages/Visitantes";
import { loadBrandingFromDB } from "./hooks/useSystemSettings";

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
          <Routes>
            <Route path="/auth" element={<Auth />} />
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
                <RoleProtectedRoute allowedRoles={['gestor_contrato', 'admin', 'gestor_frota', 'gestor_obra']}>
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
            <Route path="/app" element={<MobileApp />} />
            <Route path="/app-sms" element={<AppSms />} />
            <Route path="/app-campo" element={<AppCampo />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
  </AppErrorBoundary>
);

export default App;
