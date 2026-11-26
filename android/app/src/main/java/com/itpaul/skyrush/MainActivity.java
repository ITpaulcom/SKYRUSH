package com.itpaul.skyrush;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Randlos auf allen Android-Versionen (ab Android 15 ohnehin Pflicht). Statusleiste, Navigationsleiste und Notch
        // gibt Capacitors SystemBars als Safe-Area an die Seite weiter; das Spiel richtet sich per env(safe-area-inset-*) danach.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
