/**
 * Toca um som de notificação curto usando Web Audio API.
 * Não precisa de arquivo externo — gera o som programaticamente.
 * Silencioso em caso de erro (política do browser, etc.).
 *
 * Debounce global de 2 s: mesmo que múltiplos hooks disparem ao mesmo tempo
 * (ex: useChatGestor + useChatGestorBadge), o som toca apenas uma vez.
 */
let _lastPlayedAt = 0;

export function playNotifSound() {
  const now = Date.now();
  if (now - _lastPlayedAt < 2000) return; // já tocou recentemente
  _lastPlayedAt = now;
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx() as AudioContext;
    const now = ctx.currentTime;

    // Dois beeps: grave → agudo (estilo WhatsApp)
    const notes: [number, number, number][] = [
      [880,  0,    0.13],
      [1100, 0.16, 0.20],
    ];

    notes.forEach(([freq, start, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.01);
    });

    setTimeout(() => ctx.close(), 800);
  } catch {
    // Ignora — o browser pode bloquear AudioContext sem interação do usuário
  }
}
