package com.aurasound.musicplayer;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaStoreAudioPlugin.class);
        super.onCreate(savedInstanceState);

        // 1. Demande des permissions de stockage
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                }, 101);
            }
        }

        // 2. Acquisition d'un Partial WakeLock pour lecture ininterrompue en arrière-plan et écran éteint
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraSound:AudioPlaybackWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception e) {
            // Ignorer
        }

        // 3. Configuration du WebView pour lecture média sans restriction d'arrière-plan
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebSettings ws = bridge.getWebView().getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception e) {
            // Ignorer
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Empêche la mise en veille des timers audio du WebView en arrière-plan
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Assure la continuité de lecture quand l'application passe en tâche de fond
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "(function() { if (window.__onAuraBackPressed && window.__onAuraBackPressed()) { return 'true'; } return 'false'; })()",
                value -> {
                    if ("\"true\"".equals(value) || "true".equals(value)) {
                        // Action de retour consommée par l'interface web (fermeture lecteur / modal)
                    } else {
                        // Écran principal : mise en arrière-plan sans couper la musique
                        moveTaskToBack(true);
                    }
                }
            );
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }
}