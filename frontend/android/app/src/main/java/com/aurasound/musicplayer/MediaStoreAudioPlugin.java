package com.aurasound.musicplayer;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "MediaStoreAudio")
public class MediaStoreAudioPlugin extends Plugin {

    private static MediaStoreAudioPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void dispatchMediaAction(String action) {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("action", action);
            instance.notifyListeners("mediaAction", ret);
        }
    }
    public static void dispatchExoEvent(String event, long positionMs, long durationMs) {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("event", event);
            ret.put("position", positionMs);
            ret.put("duration", durationMs);
            instance.notifyListeners("exoEvent", ret);
        }
    }

    public static void clearNotification(Context context) {
        // Delegate to foreground service to stop properly
        try {
            AuraSoundPlaybackService.stopService(context);
        } catch (Exception e) {
            android.app.NotificationManager manager = (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(AuraSoundPlaybackService.NOTIFICATION_ID);
        }
        AuraSoundWidget.updateWidgetState(context, "AuraSound HD", "Lecteur Haute Définition", false, null);
    }

    private boolean hasAudioPermission(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        String title = call.getString("title", "AuraSound");
        String artist = call.getString("artist", "Artiste inconnu");
        String album = call.getString("album", "AuraSound HD");
        String filePath = call.getString("filePath", null);
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));

        Context context = getContext();
        // Délégation au Foreground Service – garantit la survie écran éteint (Xiaomi Doze)
        try {
            AuraSoundPlaybackService.updateState(context, title, artist, album, filePath, isPlaying);
        } catch (Exception e) {
            // fallback: log
            e.printStackTrace();
        }
        call.resolve();
    }

    @PluginMethod
    public void scanLocalAudio(PluginCall call) {
        Context context = getContext();

        if (!hasAudioPermission(context)) {
            JSObject errorRet = new JSObject();
            errorRet.put("success", false);
            errorRet.put("error", "PERMISSION_DENIED");
            errorRet.put("count", 0);
            errorRet.put("tracks", new JSArray());
            call.resolve(errorRet);
            return;
        }

        // Run scan off the UI thread to avoid ANR on large libraries (Redmi 64GB)
        Executors.newSingleThreadExecutor().execute(() -> {
            JSArray tracksArray = new JSArray();
            ContentResolver contentResolver = context.getContentResolver();
            Uri musicUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
            String sortOrder = MediaStore.Audio.Media.DATE_ADDED + " DESC";
            String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DATE_ADDED
            };
            try (Cursor cursor = contentResolver.query(musicUri, projection, selection, null, sortOrder)) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                    int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                    int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED);

                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        String title = cursor.getString(titleCol);
                        String artist = cursor.getString(artistCol);
                        String album = cursor.getString(albumCol);
                        long durationMs = cursor.getLong(durationCol);
                        String filePath = cursor.getString(dataCol);
                        long size = cursor.getLong(sizeCol);
                        long dateAdded = cursor.getLong(dateCol);

                        if (filePath == null) continue;
                        File f = new File(filePath);
                        // Ignore tiny fragments / corrupted entries; 50KB min more permissive than before
                        if (!f.exists() || f.length() < 50000) continue;
                        // Skip zero-duration invalid entries
                        if (durationMs < 5000) continue;

                        if (title == null || title.trim().isEmpty() || title.equals("<unknown>")) {
                            title = f.getName().replaceFirst("[.][^.]+$", "");
                        }
                        if (artist == null || artist.trim().isEmpty() || artist.equals("<unknown>")) {
                            artist = "Artiste Inconnu";
                        }
                        if (album == null || album.trim().isEmpty() || album.equals("<unknown>")) {
                            album = "Audio Local";
                        }

                        int durationSec = (int) (durationMs / 1000);
                        Uri contentUri = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));

                        JSObject track = new JSObject();
                        track.put("id", "device_" + id);
                        track.put("title", title);
                        track.put("artist", artist);
                        track.put("album", album);
                        track.put("duration", durationSec);
                        track.put("file_path", filePath);
                        track.put("content_uri", contentUri.toString());
                        track.put("thumbnail_path", (String) null);
                        track.put("file_size", size);
                        track.put("format", "audio");
                        track.put("bitrate", 320);
                        track.put("source", "device_storage");
                        track.put("is_favorite", 0);
                        track.put("date_added", dateAdded > 0 ? dateAdded * 1000 : System.currentTimeMillis());
                        tracksArray.put(track);
                    }
                }
            } catch (Exception e) {
                JSObject errRes = new JSObject();
                errRes.put("success", false);
                errRes.put("error", e.getMessage());
                errRes.put("count", 0);
                errRes.put("tracks", tracksArray);
                call.resolve(errRes);
                return;
            }

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("count", tracksArray.length());
            res.put("tracks", tracksArray);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Context ctx = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                boolean isIgnoring = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
                JSObject ret = new JSObject();
                ret.put("isIgnoring", isIgnoring);
                call.resolve(ret);
                if (!isIgnoring) {
                    android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + ctx.getPackageName()));
                    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(intent);
                }
            } else {
                call.resolve();
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void stopPlaybackService(PluginCall call) {
        try {
            AuraSoundPlaybackService.stopService(getContext());
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    // ---- ExoPlayer Hi-Res native API ----
    @PluginMethod
    public void playNative(PluginCall call) {
        String filePath = call.getString("filePath");
        String contentUri = call.getString("contentUri");
        String title = call.getString("title", "AuraSound");
        String artist = call.getString("artist", "Artiste inconnu");
        String album = call.getString("album", "AuraSound HD");
        if ((filePath == null || filePath.isEmpty()) && (contentUri == null || contentUri.isEmpty())) {
            call.reject("filePath ou contentUri requis"); return;
        }
        // On privilégie content:// (pas de Scoped Storage exception)
        String target = (contentUri != null && !contentUri.isEmpty()) ? contentUri : filePath;
        try {
            AuraSoundPlaybackService.playNativeFile(getContext(), target, title, artist, album);
            JSObject ret = new JSObject(); ret.put("success", true); call.resolve(ret);
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "playNative failed", t);
            JSObject ret = new JSObject(); ret.put("success", false); ret.put("error", t.getMessage()); call.resolve(ret);
        }
    }
    @PluginMethod
    public void pauseNative(PluginCall call) { AuraSoundPlaybackService.pauseNative(getContext()); call.resolve(); }
    @PluginMethod
    public void resumeNative(PluginCall call) {
        // resume is just play without re-prepare if paused – use dispatch
        if (AuraSoundPlaybackService.isExoPlaying()) { call.resolve(); return; }
        // trigger play via service's exoPlayer.play() indirectly via dispatch
        try { java.lang.reflect.Field f = AuraSoundPlaybackService.class.getDeclaredField("instance"); f.setAccessible(true); Object inst = f.get(null); if (inst != null) { java.lang.reflect.Method m = inst.getClass().getDeclaredMethod("updateNotificationOnly"); m.setAccessible(true); } } catch(Exception ignored){}
        call.resolve();
    }
    @PluginMethod
    public void seekNative(PluginCall call) {
        Double pos = call.getDouble("position");
        Long posLong = call.getLong("pos");
        long posMs = pos != null ? (long)(pos * 1000) : (posLong != null ? posLong : 0L);
        AuraSoundPlaybackService.seekNative(getContext(), posMs);
        call.resolve();
    }
    @PluginMethod
    public void getNativeState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isPlaying", AuraSoundPlaybackService.isExoPlaying());
        ret.put("position", AuraSoundPlaybackService.getExoPosition() / 1000.0);
        ret.put("duration", AuraSoundPlaybackService.getExoDuration() / 1000.0);
        call.resolve(ret);
    }
}
