import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AlertasImportantesModal } from "./AlertasImportantesModal";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("apice-sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    localStorage.setItem("apice-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="h-screen overflow-hidden bg-background flex w-full">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen flex-shrink-0 sticky top-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile sidebar via Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60 border-0">
          <Sidebar
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed(value => !value)}
          sidebarCollapsed={sidebarCollapsed}
          alertCount={alertCount}
          onBellClick={() => setAlertasOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 animate-fade-in">
          {children}
        </main>
      </div>

      {/* Modal de avisos importantes */}
      <AlertasImportantesModal
        open={alertasOpen}
        onOpenChange={setAlertasOpen}
        onAlertsFound={setAlertCount}
      />
    </div>
  );
}
