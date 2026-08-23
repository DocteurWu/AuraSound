package com.aurasound.musicplayer;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.support.v4.media.session.MediaSessionCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "MediaStoreAudio")
public class MediaStoreAudioPlugin extends Plugin {

    private static final String CHANNEL_ID = "aurasound_playback_channel";
    private static final int NOTIFICATION_ID = 4040;
    private static MediaStoreAudioPlugin instance;
    private static MediaSessionCompat mediaSession;

    @Override
    public void load() {
        super.load();
        instance = this;
        createNotificationChannel();
        initMediaSession();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "AuraSound Lecture Audio",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Contrôles de lecture sur l'écran de verrouillage et panneau de notifications");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void initMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSessionCompat(getContext(), "AuraSoundMediaSession");
            mediaSession.setActive(true);
        }
    }

    public static void dispatchMediaAction(String action) {
        if (instance != null) {
            JSObject ret = new JSObject();
            ret.put("action", action);
            instance.notifyListeners("mediaAction", ret);
        }
    }

    public static void clearNotification(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
        AuraSoundWidget.updateWidgetState(context, "AuraSound HD", "Lecteur Haute Définition", false, null);
    }

    private Bitmap getRoundedCornerBitmap(Bitmap bitmap, float pixels) {
        Bitmap output = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);

        final int color = 0xff424242;
        final Paint paint = new Paint();
        final Rect rect = new Rect(0, 0, bitmap.getWidth(), bitmap.getHeight());
        final RectF rectF = new RectF(rect);

        paint.setAntiAlias(true);
        canvas.drawARGB(0, 0, 0, 0);
        paint.setColor(color);
        canvas.drawRoundRect(rectF, pixels, pixels, paint);

        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(bitmap, rect, rect, paint);

        return output;
    }

    private Bitmap createStylishCoverBitmap(String filePath) {
        if (filePath != null && !filePath.isEmpty()) {
            try {
                MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                mmr.setDataSource(filePath);
                byte[] art = mmr.getEmbeddedPicture();
                mmr.release();
                if (art != null && art.length > 0) {
                    Bitmap original = BitmapFactory.decodeByteArray(art, 0, art.length);
                    if (original != null) {
                        return getRoundedCornerBitmap(original, 32);
                    }
                }
            } catch (Exception ignored) {}
        }

        // Si pas d'artwork : Création dynamique d'un vinyle sombre néon haute résolution
        int size = 256;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setColor(0xFF0C0E14);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, bgPaint);

        // Sillons du vinyle
        Paint groovePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        groovePaint.setStyle(Paint.Style.STROKE);
        groovePaint.setColor(0x20FFFFFF);
        groovePaint.setStrokeWidth(2f);
        for (int r = 36; r < 120; r += 12) {
            canvas.drawCircle(size / 2f, size / 2f, r, groovePaint);
        }

        // Anneau Néon Cyan Fluo
        Paint neonPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        neonPaint.setStyle(Paint.Style.STROKE);
        neonPaint.setColor(0xFF00F2FE);
        neonPaint.setStrokeWidth(5f);
        canvas.drawCircle(size / 2f, size / 2f, 118, neonPaint);

        // Centre Violet / Pourpre
        Paint centerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        centerPaint.setColor(0xFF7000FF);
        canvas.drawCircle(size / 2f, size / 2f, 36, centerPaint);

        // Trou central vinyle
        Paint holePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        holePaint.setColor(0xFF08090D);
        canvas.drawCircle(size / 2f, size / 2f, 12, holePaint);

        return bitmap;
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        String title = call.getString("title", "AuraSound");
        String artist = call.getString("artist", "Artiste inconnu");
        String filePath = call.getString("filePath", null);
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));

        Context context = getContext();

        // 1. Extraction ou génération du Bitmap stylisé
        Bitmap artwork = createStylishCoverBitmap(filePath);

        // 2. Mise à jour du Widget Écran d'accueil
        AuraSoundWidget.updateWidgetState(context, title, artist, isPlaying, artwork);

        // 3. Création des PendingIntents pour la bannière de notification & écran de verrouillage
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
                context, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent prevIntent = new Intent(context, MediaNotificationReceiver.class);
        prevIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_PREV);
        PendingIntent prevPending = PendingIntent.getBroadcast(
                context, 10, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent playPauseIntent = new Intent(context, MediaNotificationReceiver.class);
        playPauseIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_PLAY_PAUSE);
        PendingIntent playPausePending = PendingIntent.getBroadcast(
                context, 11, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent nextIntent = new Intent(context, MediaNotificationReceiver.class);
        nextIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_NEXT);
        PendingIntent nextPending = PendingIntent.getBroadcast(
                context, 12, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent closeIntent = new Intent(context, MediaNotificationReceiver.class);
        closeIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_CLOSE);
        PendingIntent closePending = PendingIntent.getBroadcast(
                context, 13, closeIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        initMediaSession();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(artwork)
                .setContentTitle(title)
                .setContentText(artist)
                .setSubText("✨ AuraSound Studio HD")
                .setContentIntent(openAppPending)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(isPlaying)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setColor(0xFF00F2FE)
                .setColorized(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(R.drawable.ic_prev_white, "Précédent", prevPending)
                .addAction(isPlaying ? R.drawable.ic_pause_white : R.drawable.ic_play_white, isPlaying ? "Pause" : "Lecture", playPausePending)
                .addAction(R.drawable.ic_next_white, "Suivant", nextPending)
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2)
                        .setShowCancelButton(true)
                        .setCancelButtonIntent(closePending)
                );

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, builder.build());
        }

        call.resolve();
    }

    @PluginMethod
    public void scanLocalAudio(PluginCall call) {
        Context context = getContext();
        JSArray tracksArray = new JSArray();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                JSObject errorRet = new JSObject();
                errorRet.put("success", false);
                errorRet.put("error", "PERMISSION_DENIED");
                errorRet.put("count", 0);
                errorRet.put("tracks", tracksArray);
                call.resolve(errorRet);
                return;
            }
        }

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
                    if (!f.exists() || f.length() < 100000) continue; // Ignore fragments < 100KB

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
    }
}