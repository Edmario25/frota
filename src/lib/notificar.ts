/**
 * Aviso ao motorista — nativo no APK, web no navegador.
 *
 * O app do motorista usava `new Notification(...)` direto. Dentro do APK isso
 * nunca funcionou: o WebView do Android não implementa a Notification API, então
 * o guard `"Notification" in window` dava falso e o aviso sumia em silêncio.
 * O motorista recebia uma infração de velocidade e só descobria se abrisse o app
 * e olhasse o card — exatamente o caso em que o aviso mais importa.
 *
 * Aqui a escolha é feita em tempo de execução:
 *   • Capacitor nativo  → LocalNotifications (aparece na bandeja do Android)
 *   • Navegador/PWA     → Notification API, como antes
 *   • Nenhum dos dois   → não faz nada, sem quebrar a tela
 *
 * O plugin nativo é alcançado pela ponte global do Capacitor
 * (window.Capacitor), nunca por `import`. O sistema web da Ápice compartilha
 * estes arquivos e não tem o pacote instalado: um import estático quebraria o
 * build dele, e um import dinâmico viraria um fetch de módulo inexistente em
 * produção. Pela ponte, o mesmo código roda nos dois.
 */

/** O plugin nativo, quando o app está rodando dentro do APK. */
function pluginNotificacoes(): any | null {
  const cap = (globalThis as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.LocalNotifications
    ?? cap.registerPlugin?.("LocalNotifications")
    ?? null;
}

/** Evita repetir o mesmo aviso enquanto o app estiver aberto. */
function jaAvisado(tag: string): boolean {
  try {
    if (sessionStorage.getItem(`notif_${tag}`)) return true;
    sessionStorage.setItem(`notif_${tag}`, "1");
    return false;
  } catch {
    return false; // sessionStorage bloqueado: melhor avisar duas vezes que nenhuma
  }
}

function rodandoNativo(): boolean {
  const cap = (globalThis as any).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Id numérico estável a partir da tag — o Android exige inteiro. */
function idDaTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

async function avisarNativo(titulo: string, corpo: string, tag: string): Promise<boolean> {
  try {
    const LocalNotifications = pluginNotificacoes();
    if (!LocalNotifications) return false;

    let { display } = await LocalNotifications.checkPermissions();
    if (display !== "granted") {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== "granted") return false;

    await LocalNotifications.schedule({
      notifications: [{
        id: idDaTag(tag),
        title: titulo,
        body: corpo,
        smallIcon: "ic_stat_icon_config_sample",
        // Sem schedule.at: dispara imediatamente.
      }],
    });
    return true;
  } catch {
    return false;
  }
}

async function avisarWeb(titulo: string, corpo: string, tag: string): Promise<boolean> {
  try {
    if (!("Notification" in window)) return false;
    let permissao = Notification.permission;
    if (permissao === "default") permissao = await Notification.requestPermission();
    if (permissao !== "granted") return false;
    new Notification(titulo, { body: corpo, tag, icon: "/favicon.ico" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mostra um aviso ao motorista uma única vez por `tag`.
 * Devolve true se o aviso chegou a ser exibido por algum canal.
 */
export async function notificarMotorista(
  titulo: string,
  corpo: string,
  tag: string,
): Promise<boolean> {
  if (jaAvisado(tag)) return false;
  if (rodandoNativo()) {
    const ok = await avisarNativo(titulo, corpo, tag);
    if (ok) return true;
    // Permissão negada no nativo: não adianta tentar o caminho web.
    return false;
  }
  return avisarWeb(titulo, corpo, tag);
}

/**
 * Pede a permissão de notificação de forma explícita (tela de perfil).
 * Devolve o estado final: "granted" | "denied" | "indisponivel".
 */
export async function pedirPermissaoNotificacao(): Promise<string> {
  if (rodandoNativo()) {
    try {
      const LocalNotifications = pluginNotificacoes();
      if (!LocalNotifications) return "indisponivel";
      const { display } = await LocalNotifications.requestPermissions();
      return display === "granted" ? "granted" : "denied";
    } catch {
      return "indisponivel";
    }
  }
  if (!("Notification" in window)) return "indisponivel";
  return Notification.requestPermission();
}
