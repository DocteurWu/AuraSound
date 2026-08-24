package com.aurasound.musicplayer;

import android.Manifest;
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
import android.widget.Toast;

public class MainActivity extends BridgeActivity {

    private static final int REQ_PERMISSIONS = 101;
    private static final int REQ_BATTERY_OPT = 102;
    private static final int REQ_NOTIFICATION = 103;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        installCrashLogger();
        registerPlugin(MediaStoreAudioPlugin.class);
        super.onCreate(savedInstanceState);

        requestAllPermissions();
        configureWebView();
        promptBatteryOptimizationIfNeeded();
    }

    /**
     * Écrit toute exception non rattrapée dans un fichier lisible via adb :
     * adb shell cat /storage/emulated/0/Android/data/com.aurasound.musicplayer/files/crash_log.txt
     */
    private void installCrashLogger() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                java.io.File dir = getExternalFilesDir(null);
                if (dir != null && dir.canWrite()) {
                    java.io.File f = new java.io.File(dir, "crash_log.txt");
                    java.io.PrintWriter pw = new java.io.PrintWriter(new java.io.FileWriter(f, true));
                    pw.println("\n==== CRASH " + new java.util.Date() + " thread=" + thread.getName() + " ====");
                    throwable.printStackTrace(pw);
                    pw.close();
                }
            } catch (Throwable ignored) {}
            if (previous != null) previous.uncaughtException(thread, throwable);
        });
    }

    private void requestAllPermissions() {
        // Android 13+ needs READ_MEDIA_AUDIO + POST_NOTIFICATIONS, older needs READ_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean needAudio = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED;
            boolean needNotif = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
            java.util.List<String> perms = new java.util.ArrayList<>();
            if (needAudio) perms.add(Manifest.permission.READ_MEDIA_AUDIO);
            if (needNotif) perms.add(Manifest.permission.POST_NOTIFICATIONS);
            if (!perms.isEmpty()) {
                ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), REQ_PERMISSIONS);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            boolean needRead = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED;
            boolean needNotif = false;
            if (Build.VERSION.SDK_INT >= 33) {
                needNotif = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
            }
            java.util.List<String> perms = new java.util.ArrayList<>();
            if (needRead) perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (needNotif) perms.add(Manifest.permission.POST_NOTIFICATIONS);
            if (!perms.isEmpty()) {
                ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), REQ_PERMISSIONS);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS) {
            boolean allGranted = true;
            for (int r : grantResults) if (r != PackageManager.PERMISSION_GRANTED) allGranted = false;
            if (!allGranted) {
                Toast.makeText(this, "Certaines permissions ont été refusées – la lecture en arrière-plan et le scan peuvent être limités.", Toast.LENGTH_LONG).show();
            } else {
                // Trigger JS rescan after grant
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('aurasound_permissions_granted'))", null);
                }
            }
        }
    }

    private void promptBatteryOptimizationIfNeeded() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    // Show system dialog to whitelist app – critical for Xiaomi Redmi
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    // Use try/catch for devices that block this intent (some Xiaomi)
                    try {
                        startActivityForResult(intent, REQ_BATTERY_OPT);
                    } catch (Exception e) {
                        // Fallback: open battery optimization settings
                        Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        startActivity(fallback);
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_BATTERY_OPT) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            boolean whitelisted = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            String msg = whitelisted ? "Optimisation batterie désactivée – lecture ininterrompue activée !" : "Pense à désactiver l'optimisation batterie dans Paramètres > Batterie pour éviter les coupures.";
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        }
    }

    private void configureWebView() {
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebSettings ws = bridge.getWebView().getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
                ws.setDomStorageEnabled(true);
                ws.setAllowFileAccess(true);
                ws.setAllowContentAccess(true);
                // Keep WebView alive
                bridge.getWebView().setKeepScreenOn(false);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
            // Do NOT pause WebView – keep audio alive
        }
    }

    @Override
    public void onStop() {
        super.onStop();
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
                    } else {
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
        // Service handles WakeLock now – just ensure if not playing, service stops
        // Don't force kill service if music playing (START_STICKY handles it)
    }
}
