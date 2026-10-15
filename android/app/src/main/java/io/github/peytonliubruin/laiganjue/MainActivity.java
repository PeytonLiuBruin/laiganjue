package io.github.peytonliubruin.laiganjue;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 网页铺满到状态栏与导航栏下方，安全区由 CSS 的 env(safe-area-inset-*) 处理（见 capacitor.config.json 的 SystemBars）
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
