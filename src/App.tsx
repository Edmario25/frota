import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
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
import MobileApp from "./pages/app/MobileApp";
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
            {/* /app gerencia seu próprio auth — não usa ProtectedRoute */}
            <Route path="/app" element={<MobileApp />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
