package shop.apicesystem.smscampo;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.WindowManager;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Impede captura de tela e visualização de dados na tela de apps recentes.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
