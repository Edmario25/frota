package br.com.apicegestao.totem;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.view.Window;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity do Ponto Totem.
 *
 * Comportamentos especiais:
 *  - FLAG_KEEP_SCREEN_ON    → tela nunca apaga enquanto o app está aberto
 *  - Immersive Sticky Mode  → barra de status e barra de navegação ficam ocultas;
 *                             o usuário pode deslizar para revelar e elas somem após 2 s
 *  - onBackPressed()        → noop (impede fechar o app por acidente no tablet)
 *
 * Para lock task / kiosk mode completo (requer Device Owner):
 *   startLockTask() no onCreate() — veja SETUP.md seção "Kiosk Mode".
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── 1. Manter tela acesa ──────────────────────────────────────────────
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // ── 2. Modo imersivo sticky (sem barras) ──────────────────────────────
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    // ── Bloqueia botão voltar ─────────────────────────────────────────────────
    @Override
    public void onBackPressed() {
        // Intencionalmente não faz nada — o totem não tem navegação
        // Remova ou adapte se precisar de um menu de saída protegido por PIN
    }
}
