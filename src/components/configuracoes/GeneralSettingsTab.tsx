import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building, Bell, Save, ImageIcon, Aperture, Upload, X } from "lucide-react";
import { saveBrandingToDB } from "@/hooks/useSystemSettings";

const STORAGE_KEY = "fleet_settings";

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Upload local: lê arquivo como base64 e chama onChange sem tocar no Supabase Storage */
function LocalImageUpload({
  label,
  value,
  onChange,
  accept = "image/png,image/jpeg,image/webp,image/svg+xml",
  maxKB = 2048,
}: {
  label: string;
  value: string;
  onChange: (base64: string) => void;
  accept?: string;
  maxKB?: number;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxKB * 1024) {
      toast.error(`Arquivo muito grande. Máximo: ${maxKB < 1024 ? maxKB + " KB" : maxKB / 1024 + " MB"}.`);
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange(ev.target?.result as string);
      setLoading(false);
    };
    reader.onerror = () => {
      toast.error("Erro ao ler o arquivo.");
      setLoading(false);
    };
    reader.readAsDataURL(file);

    // limpar input para permitir reselecionar o mesmo arquivo
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        {loading ? "Carregando..." : value ? "Trocar imagem" : label}
      </Button>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange("")}
          className="gap-1 text-destructive hover:text-destructive"
        >
          <X className="h-4 w-4" />
          Remover
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

export function GeneralSettingsTab() {
  const saved = loadSettings();

  const [companyName, setCompanyName] = useState(saved.companyName ?? "Fleet Scale");
  const [companyEmail, setCompanyEmail] = useState(saved.companyEmail ?? "");
  const [companyPhone, setCompanyPhone] = useState(saved.companyPhone ?? "");

  // Branding
  const [logoUrl, setLogoUrl] = useState<string>(saved.logoUrl ?? "");
  const [iconUrl, setIconUrl] = useState<string>(saved.iconUrl ?? "");

  // Notification settings
  const [notifyMaintenance, setNotifyMaintenance] = useState(saved.notifyMaintenance ?? true);
  const [notifyKmLimit, setNotifyKmLimit] = useState(saved.notifyKmLimit ?? true);
  const [notifyDocExpiry, setNotifyDocExpiry] = useState(saved.notifyDocExpiry ?? true);
  const [notifyScheduleConflict, setNotifyScheduleConflict] = useState(saved.notifyScheduleConflict ?? true);
  const [diasAvisoFolga, setDiasAvisoFolga] = useState<number>(saved.diasAvisoFolga ?? 5);

  const handleSave = async () => {
    const settings = {
      companyName,
      companyEmail,
      companyPhone,
      logoUrl,
      iconUrl,
      notifyMaintenance,
      notifyKmLimit,
      notifyDocExpiry,
      notifyScheduleConflict,
      diasAvisoFolga,
    };

    // 1. Salva no localStorage imediatamente
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    // 2. Atualiza favicon imediatamente
    if (iconUrl) updateFavicon(iconUrl);

    // 3. Notifica Sidebar e outros componentes na mesma aba (não depende do DB)
    window.dispatchEvent(new Event("fleet-settings-updated"));

    // 4. Salva no Supabase em background (para outros usuários verem)
    //    saveBrandingToDB nunca lança exceção, então é seguro fazer await aqui
    const savedToDB = await saveBrandingToDB({ companyName, logoUrl, iconUrl });

    toast.success(
      savedToDB
        ? "Configurações salvas com sucesso!"
        : "Configurações salvas localmente. Execute a migration do banco para sincronizar com todos os usuários."
    );
  };

  return (
    <div className="space-y-6">

      {/* Identidade Visual */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Identidade Visual</CardTitle>
              <CardDescription>
                Logo exibida na barra lateral e ícone (favicon) da aba do navegador
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Logo */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Logo da Empresa</Label>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Imagem exibida na barra lateral do sistema (recomendado: PNG ou SVG
                com fundo transparente, mín. 200×60 px).
              </p>

              {/* Preview */}
              {logoUrl && (
                <div className="rounded-xl border border-border bg-sidebar p-3 flex items-center justify-center h-20">
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="max-h-14 max-w-full object-contain"
                  />
                </div>
              )}

              <LocalImageUpload
                label="Selecionar logo"
                value={logoUrl}
                onChange={setLogoUrl}
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                maxKB={2048}
              />
              <p className="text-xs text-muted-foreground">PNG, SVG ou JPEG · máx. 2 MB · salva localmente</p>
            </div>

            {/* Icon / Favicon */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Aperture className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Ícone do Sistema (Favicon)</Label>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ícone exibido na aba do navegador. Recomendado: PNG quadrado
                512×512 px com fundo transparente.
              </p>

              {/* Preview */}
              {iconUrl && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-center h-20">
                  <img
                    src={iconUrl}
                    alt="Icon preview"
                    className="h-12 w-12 object-contain rounded-lg"
                  />
                </div>
              )}

              <LocalImageUpload
                label="Selecionar ícone"
                value={iconUrl}
                onChange={setIconUrl}
                accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
                maxKB={512}
              />
              <p className="text-xs text-muted-foreground">PNG ou ICO quadrado · máx. 512 KB · salva localmente</p>
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
            <strong>Dica:</strong> Após salvar, atualize a página para ver o ícone aplicado na aba do
            navegador. O logo é atualizado na barra lateral imediatamente após salvar.
          </div>
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Dados da Empresa</CardTitle>
              <CardDescription>Informações gerais da organização</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nome da Empresa</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-email">Email de Contato</Label>
              <Input
                id="company-email"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="contato@empresa.com"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Telefone</Label>
              <Input
                id="company-phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="(00) 0000-0000"
                className="rounded-xl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-0 shadow-medium rounded-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Notificações</CardTitle>
              <CardDescription>Configure quais alertas o sistema deve exibir</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {[
            { label: "Manutenções Agendadas", desc: "Alertar sobre manutenções preventivas próximas", value: notifyMaintenance, setter: setNotifyMaintenance },
            { label: "Limite de Km Mensal", desc: "Alertar quando veículo atingir 80% do limite mensal", value: notifyKmLimit, setter: setNotifyKmLimit },
            { label: "Vencimento de Documentos", desc: "Alertar sobre documentos próximos do vencimento", value: notifyDocExpiry, setter: setNotifyDocExpiry },
            { label: "Conflitos de Escala", desc: "Alertar sobre sobreposição de escalas de trabalho", value: notifyScheduleConflict, setter: setNotifyScheduleConflict },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={item.value} onCheckedChange={item.setter} />
              </div>
              {i < 3 && <Separator className="mt-4" />}
            </div>
          ))}

          <Separator />

          {/* Aviso de folga próxima */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Aviso antecipado de folgas</p>
              <p className="text-xs text-muted-foreground">
                Exibir alerta quando a folga de um funcionário estiver a X dias
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={diasAvisoFolga}
                onChange={e => setDiasAvisoFolga(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                className="w-16 h-9 border border-input rounded-lg text-center text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">dias antes</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="gap-2 rounded-xl px-6">
          <Save className="h-4 w-4" />
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

/** Atualiza o favicon dinamicamente no <head> do documento */
function updateFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}
