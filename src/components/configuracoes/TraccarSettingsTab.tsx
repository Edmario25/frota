import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Satellite, Save, Plug, CheckCircle2, XCircle, Loader2,
  MonitorDot, WifiOff, RefreshCw, Info,
} from "lucide-react";
import {
  useTraccar,
  loadTraccarConfig,
  saveTraccarConfig,
  type TraccarConfig,
  type TraccarDevice,
} from "@/hooks/useTraccar";

export function TraccarSettingsTab() {
  const { testConnection, getDevices } = useTraccar();

  const [url, setUrl]           = useState("");
  const [authMode, setAuthMode] = useState<"token" | "basic">("token");
  const [token, setToken]       = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  const [testing,  setTesting]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState<"idle" | "ok" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [devices,  setDevices]  = useState<TraccarDevice[]>([]);

  // Carrega config salva
  useEffect(() => {
    loadTraccarConfig().then(cfg => {
      if (!cfg) return;
      setUrl(cfg.url);
      if (cfg.token) { setAuthMode("token"); setToken(cfg.token); }
      else if (cfg.email) { setAuthMode("basic"); setEmail(cfg.email); setPassword(cfg.password ?? ""); }
    });
  }, []);

  function buildConfig(): TraccarConfig {
    return authMode === "token"
      ? { url, token }
      : { url, email, password };
  }

  async function handleTest() {
    if (!url) { toast.error("Informe a URL do servidor Traccar."); return; }
    setTesting(true);
    setStatus("idle");
    try {
      const name = await testConnection(buildConfig());
      setStatus("ok");
      setStatusMsg(`Conectado como: ${name}`);
      toast.success("Conexão com Traccar estabelecida!");
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e.message ?? "Falha na conexão");
      toast.error("Falha ao conectar no Traccar", { description: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleLoadDevices() {
    if (!url) return;
    setLoading(true);
    try {
      const list = await getDevices(buildConfig());
      setDevices(list);
      toast.success(`${list.length} dispositivo(s) carregado(s).`);
    } catch (e: any) {
      toast.error("Erro ao listar dispositivos", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!url) { toast.error("Informe a URL do servidor."); return; }
    setSaving(true);
    const ok = await saveTraccarConfig(buildConfig());
    setSaving(false);
    if (ok) toast.success("Configurações do Traccar salvas!");
    else toast.error("Erro ao salvar. Verifique se a tabela system_settings existe.");
  }

  const statusIcon = status === "ok"
    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : status === "error"
    ? <XCircle className="h-4 w-4 text-red-500" />
    : null;

  return (
    <div className="space-y-6">

      {/* Conexão */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <Satellite className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Servidor Traccar</CardTitle>
              <CardDescription>Configure a URL e as credenciais de acesso à API</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* URL */}
          <div className="space-y-2">
            <Label>URL do Servidor</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://traccar.suaempresa.com"
              className="rounded-xl font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Sem barra no final. Ex.: <code>https://gps.empresa.com.br</code>
            </p>
          </div>

          <Separator />

          {/* Modo de autenticação */}
          <div className="space-y-3">
            <Label>Autenticação</Label>
            <RadioGroup
              value={authMode}
              onValueChange={v => setAuthMode(v as "token" | "basic")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="token" id="auth-token" />
                <Label htmlFor="auth-token" className="cursor-pointer">Token de API</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="basic" id="auth-basic" />
                <Label htmlFor="auth-basic" className="cursor-pointer">Email + Senha</Label>
              </div>
            </RadioGroup>
          </div>

          {authMode === "token" ? (
            <div className="space-y-2">
              <Label>Token de API</Label>
              <Input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Cole seu token aqui"
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                No Traccar: <strong>Menu → Preferências → Token de API</strong>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Status + botões */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing}
              className="gap-2 rounded-xl"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Testar Conexão
            </Button>

            {status !== "idle" && (
              <div className="flex items-center gap-2 text-sm">
                {statusIcon}
                <span className={status === "ok" ? "text-green-600" : "text-red-600"}>
                  {statusMsg}
                </span>
              </div>
            )}
          </div>

          {/* Dica CORS */}
          <div className="rounded-lg bg-sky-50 border border-sky-200 px-4 py-3 text-xs text-sky-700 flex gap-2">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p><strong>Configuração necessária no Traccar</strong> (traccar.xml):</p>
              <p>Adicione a origem exata do seu sistema (não use <code>*</code> — cookies não funcionam com wildcard):</p>
              <code className="block bg-sky-100 px-2 py-1 rounded font-mono">
                {"<entry key='web.origin'>https://seuapp.com</entry>"}
              </code>
              <p>Para desenvolvimento local:</p>
              <code className="block bg-sky-100 px-2 py-1 rounded font-mono">
                {"<entry key='web.origin'>http://localhost:8080</entry>"}
              </code>
              <p className="text-sky-600">Reinicie o serviço Traccar após alterar o arquivo.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dispositivos */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <MonitorDot className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Dispositivos Cadastrados</CardTitle>
              <CardDescription>
                Visualize os rastreadores disponíveis para vincular aos veículos
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={handleLoadDevices}
            disabled={loading || !url}
            className="gap-2 rounded-xl"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            Carregar Dispositivos
          </Button>

          {devices.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Identificador</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Última Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{d.id}</td>
                      <td className="px-4 py-2.5 font-medium">{d.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{d.uniqueId}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          className={
                            d.status === "online"
                              ? "bg-green-100 text-green-700 border-0 text-xs"
                              : "bg-gray-100 text-gray-500 border-0 text-xs"
                          }
                        >
                          {d.status === "online"
                            ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1" />Online</>
                            : <><WifiOff className="h-3 w-3 mr-1 inline" />Offline</>
                          }
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {d.lastUpdate
                          ? new Date(d.lastUpdate).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {devices.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground italic">
              Clique em "Carregar Dispositivos" para ver os rastreadores cadastrados no Traccar.
              O <strong>ID</strong> de cada dispositivo é usado para vincular ao veículo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl px-6">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
