import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Car, Satellite } from "lucide-react";
import { GeneralSettingsTab } from "@/components/configuracoes/GeneralSettingsTab";
import { FleetParametersTab } from "@/components/configuracoes/FleetParametersTab";
import { TraccarSettingsTab } from "@/components/configuracoes/TraccarSettingsTab";

// Usuários e acessos ficam em Admin → Controle de Acesso.
const Configuracoes = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-muted-foreground mt-1">Parâmetros do sistema, da frota e integrações. Usuários e acessos ficam em Controle de Acesso.</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl h-auto flex-wrap">
            <TabsTrigger value="general" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-subtle px-4 py-2.5">
              <Settings className="h-4 w-4" />
              <span>Configurações Gerais</span>
            </TabsTrigger>
            <TabsTrigger value="fleet" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-subtle px-4 py-2.5">
              <Car className="h-4 w-4" />
              <span>Parâmetros de Frota</span>
            </TabsTrigger>
            <TabsTrigger value="traccar" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-subtle px-4 py-2.5">
              <Satellite className="h-4 w-4" />
              <span>GPS / Traccar</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralSettingsTab />
          </TabsContent>

          <TabsContent value="fleet">
            <FleetParametersTab />
          </TabsContent>

          <TabsContent value="traccar">
            <TraccarSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Configuracoes;
