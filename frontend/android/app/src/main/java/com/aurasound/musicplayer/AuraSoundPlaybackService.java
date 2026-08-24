package com.aurasound.musicplayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.support.v4.media.session.MediaSessionCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.io.File;

public class AuraSoundPlaybackService extends Service implements AudioManager.OnAudioFocusChangeListener {

    public static final String CHANNEL_ID = "aurasound_playback_channel";
    public static final int NOTIFICATION_ID = 4040;

    public static final String ACTION_START = "com.aurasound.ACTION_START_PLAYBACK";
    public static final String ACTION_UPDATE = "com.aurasound.ACTION_UPDATE_PLAYBACK";
    public static final String ACTION_STOP_SERVICE = "com.aurasound.ACTION_STOP_PLAYBACK_SERVICE";
    public static final String ACTION_NATIVE_PLAY = "com.aurasound.ACTION_NATIVE_PLAY";
    public static final String ACTION_NATIVE_PAUSE = "com.aurasound.ACTION_NATIVE_PAUSE";
    public static final String ACTION_NATIVE_SEEK = "com.aurasound.ACTION_NATIVE_SEEK";

    private static String currentTitle = "AuraSound";
    private static String currentArtist = "Artiste inconnu";
    private static String currentAlbum = "AuraSound HD";
    private static String currentFilePath = null;
    private static boolean currentIsPlaying = false;

    private static AuraSoundPlaybackService instance;

    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasAudioFocus = false;
    private ExoPlayer exoPlayer;
    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());

    // Cache thread-safe : ExoPlayer ne doit JAMAIS être lu hors du main thread.
    // Ces champs sont écrits uniquement depuis le main (listener + ticker), lus de partout.
    private static volatile boolean cachedPlaying = false;
    private static volatile long cachedPosition = 0;
    private static volatile long cachedDuration = 0;
    private static final Runnable positionTicker = new Runnable() {
        @Override public void run() {
            AuraSoundPlaybackService s = instance;
            if (s == null || s.exoPlayer == null) return;
            try {
                cachedPosition = s.exoPlayer.getCurrentPosition();
                long d = s.exoPlayer.getDuration();
                cachedDuration = (d == androidx.media3.common.C.TIME_UNSET) ? 0 : d;
            } catch (Throwable ignored) {}
            if (cachedPlaying) s.mainHandler.postDelayed(this, 500);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        initMediaSession();
        initExoPlayer();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        acquireWakeLock();
    }

    private void initExoPlayer() {
        if (exoPlayer != null) return;
        try {
            exoPlayer = new ExoPlayer.Builder(this).build();
            exoPlayer.setRepeatMode(Player.REPEAT_MODE_OFF);
            exoPlayer.setHandleAudioBecomingNoisy(true);
            exoPlayer.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_ENDED) {
                        // Fin naturelle du morceau : signaler 'ended' pour que le JS
                        // enregistre la télémétrie comme COMPLÈTE puis avance dans la file
                        MediaStoreAudioPlugin.dispatchExoEvent("ended", cachedPosition, cachedDuration);
                    }
                }
                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    currentIsPlaying = isPlaying;
                    cachedPlaying = isPlaying;
                    try { cachedDuration = exoPlayer.getDuration(); } catch (Throwable ignored) {}
                    mainHandler.removeCallbacks(positionTicker);
                    if (isPlaying) mainHandler.postDelayed(positionTicker, 500);
                    try { updateNotificationOnly(); } catch (Exception ignored) {}
                    MediaStoreAudioPlugin.dispatchExoEvent(isPlaying ? "playing" : "paused", cachedPosition, cachedDuration);
                }
                @Override
                public void onPlayerError(androidx.media3.common.PlaybackException error) {
                    android.util.Log.e("AuraSound", "ExoPlayer error: " + (error != null ? error.getMessage() : "null"), error);
                    MediaStoreAudioPlugin.dispatchExoEvent("error", 0, 0);
                }
            });
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "initExoPlayer failed", t);
            exoPlayer = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "AuraSound Lecture Audio", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Contrôles de lecture sur l'écran de verrouillage et panneau de notifications");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void initMediaSession() {
        if (mediaSession == null) {
            mediaSession = new MediaSessionCompat(this, "AuraSoundMediaSession");
            mediaSession.setActive(true);
            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override public void onPlay() { MediaStoreAudioPlugin.dispatchMediaAction("playPause"); if (exoPlayer != null) exoPlayer.play(); }
                @Override public void onPause() { MediaStoreAudioPlugin.dispatchMediaAction("pause"); if (exoPlayer != null) exoPlayer.pause(); }
                @Override public void onSkipToNext() { MediaStoreAudioPlugin.dispatchMediaAction("next"); }
                @Override public void onSkipToPrevious() { MediaStoreAudioPlugin.dispatchMediaAction("prev"); }
                @Override public void onStop() { MediaStoreAudioPlugin.dispatchMediaAction("stop"); if (exoPlayer != null) exoPlayer.stop(); }
                @Override public void onSeekTo(long pos) { if (exoPlayer != null) exoPlayer.seekTo(pos); }
            });
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) { wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraSound:AudioPlaybackWakeLock"); wakeLock.setReferenceCounted(false); }
            }
            if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(6*60*60*1000L);
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() { try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {} }

    private boolean requestAudioFocus() {
        try {
            if (hasAudioFocus) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attrs).setOnAudioFocusChangeListener(this).build();
                int res = audioManager.requestAudioFocus(focusRequest);
                hasAudioFocus = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
            } else { int res = audioManager.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN); hasAudioFocus = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED); }
        } catch (Exception e) { hasAudioFocus = true; }
        return hasAudioFocus;
    }

    private void abandonAudioFocus() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
            else audioManager.abandonAudioFocus(this);
        } catch (Exception ignored) {}
        hasAudioFocus = false;
    }

    @Override public void onAudioFocusChange(int focusChange) {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                if (exoPlayer != null) exoPlayer.pause();
                MediaStoreAudioPlugin.dispatchMediaAction("pause");
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK: if (exoPlayer != null) exoPlayer.setVolume(0.35f); break;
            case AudioManager.AUDIOFOCUS_GAIN: if (exoPlayer != null) exoPlayer.setVolume(1f); break;
        }
    }

    // ---- ExoPlayer Hi-Res native controls (called from plugin) ----
    public static void playNativeFile(Context ctx, String filePath, String title, String artist, String album) {
        currentTitle = title != null ? title : "AuraSound";
        currentArtist = artist != null ? artist : "Artiste inconnu";
        currentAlbum = album != null ? album : "AuraSound HD";
        currentFilePath = filePath;
        currentIsPlaying = true;
        Intent i = new Intent(ctx, AuraSoundPlaybackService.class);
        i.setAction(ACTION_NATIVE_PLAY);
        i.putExtra("title", currentTitle); i.putExtra("artist", currentArtist); i.putExtra("album", currentAlbum); i.putExtra("filePath", filePath);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i); else ctx.startService(i);
    }
    public static void pauseNative(Context ctx) {
        Intent i = new Intent(ctx, AuraSoundPlaybackService.class); i.setAction(ACTION_NATIVE_PAUSE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i); else ctx.startService(i);
    }
    public static void resumeNative(Context ctx) {
        AuraSoundPlaybackService s = instance;
        if (s != null && s.exoPlayer != null) {
            // exoPlayer.play() doit s'exécuter sur le main thread
            s.mainHandler.post(() -> { try { s.exoPlayer.play(); } catch (Throwable ignored) {} });
            return;
        }
    }
    public static void seekNative(Context ctx, long posMs) {
        Intent i = new Intent(ctx, AuraSoundPlaybackService.class); i.setAction(ACTION_NATIVE_SEEK); i.putExtra("pos", posMs);
        ctx.startService(i);
    }
    // Lecture du cache volatile – sûr depuis n'importe quel thread (CapacitorPlugins inclus)
    public static boolean isExoPlaying() { return cachedPlaying; }
    public static long getExoPosition() { return cachedPosition; }
    public static long getExoDuration() { return cachedDuration; }

    private void doNativePlay(String filePath) {
        initExoPlayer();
        if (exoPlayer == null) { MediaStoreAudioPlugin.dispatchExoEvent("error", 0, 0); return; }
        try {
            Uri uri = buildPlayableUri(filePath);
            if (uri == null) {
                android.util.Log.e("AuraSound", "doNativePlay: URI introuvable pour " + filePath);
                MediaStoreAudioPlugin.dispatchExoEvent("error", 0, 0);
                return;
            }
            android.util.Log.d("AuraSound", "ExoPlayer play uri=" + uri);
            MediaItem item = MediaItem.fromUri(uri);
            exoPlayer.setMediaItem(item);
            exoPlayer.prepare();
            exoPlayer.setPlayWhenReady(true);
            requestAudioFocus();
            acquireWakeLock();
        } catch (Throwable t) {
            // Ne jamais crasher le process : on notifie l'UI qui retombe sur WebAudio
            android.util.Log.e("AuraSound", "doNativePlay failed", t);
            currentIsPlaying = false;
            MediaStoreAudioPlugin.dispatchExoEvent("error", 0, 0);
        }
    }

    /**
     * Construit une URI lisible par ExoPlayer sans Scoped Storage exception.
     * Priorité : content:// MediaStore > file:// direct.
     */
    private Uri buildPlayableUri(String filePath) {
        if (filePath == null || filePath.isEmpty()) return null;
        try {
            // 1. Déjà une content:// ou http(s)
            if (filePath.startsWith("content://") || filePath.startsWith("http")) {
                return Uri.parse(filePath);
            }
            // 2. Résoudre via MediaStore DATA -> _ID (fiable sur Android 10+, pas de SecurityException)
            try {
                Cursor c = getContentResolver().query(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        new String[]{MediaStore.Audio.Media._ID},
                        MediaStore.Audio.Media.DATA + "=?",
                        new String[]{filePath}, null);
                if (c != null) {
                    if (c.moveToFirst()) {
                        long id = c.getLong(0);
                        c.close();
                        Uri content = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));
                        android.util.Log.d("AuraSound", "Resolved content URI: " + content);
                        return content;
                    }
                    c.close();
                }
            } catch (Exception ignored) {}
            // 3. Fallback file:// direct (fonctionne avec requestLegacyExternalStorage + permission)
            File f = new File(filePath);
            if (f.exists()) return Uri.fromFile(f);
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "buildPlayableUri failed", t);
        }
        return null;
    }

    public static void updateState(Context context, String title, String artist, String album, String filePath, boolean isPlaying) {
        currentTitle = title != null ? title : "AuraSound";
        currentArtist = artist != null ? artist : "Artiste inconnu";
        currentAlbum = album != null ? album : "AuraSound HD";
        currentFilePath = filePath;
        currentIsPlaying = isPlaying;
        Intent i = new Intent(context, AuraSoundPlaybackService.class);
        i.setAction(isPlaying ? ACTION_START : ACTION_UPDATE);
        i.putExtra("title", currentTitle); i.putExtra("artist", currentArtist); i.putExtra("album", currentAlbum); i.putExtra("filePath", currentFilePath); i.putExtra("isPlaying", isPlaying);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i); else context.startService(i);
    }
    public static void stopService(Context context) {
        Intent i = new Intent(context, AuraSoundPlaybackService.class); i.setAction(ACTION_STOP_SERVICE); context.startService(i);
    }

    private void updateNotificationOnly() {
        Notification notif;
        try { notif = buildNotification(currentTitle, currentArtist, currentAlbum, currentFilePath, currentIsPlaying); }
        catch (Throwable t) {
            android.util.Log.e("AuraSound", "buildNotification failed", t);
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notif, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, notif);
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "startForeground failed", t);
            try { NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.notify(NOTIFICATION_ID, notif); } catch (Throwable ignored) {}
        }
        // Widget : protégé – un bitmap trop lourd lève TransactionTooLargeException et
        // ferait mourir le service sans startForeground => RemoteServiceException (crash app)
        try {
            Bitmap art = createCoverBitmap(currentFilePath);
            if (art != null) {
                // Réduction agressive : les RemoteViews limitent la taille des bitmaps en IPC
                int maxDim = 512;
                if (art.getWidth() > maxDim || art.getHeight() > maxDim) {
                    float scale = Math.min((float) maxDim / art.getWidth(), (float) maxDim / art.getHeight());
                    art = Bitmap.createScaledBitmap(art, Math.max(1,(int)(art.getWidth()*scale)), Math.max(1,(int)(art.getHeight()*scale)), true);
                }
            }
            AuraSoundWidget.updateWidgetState(this, currentTitle, currentArtist, currentIsPlaying, art);
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "widget update failed", t);
        }
        // mediasession
        try {
            if (mediaSession != null) {
                android.support.v4.media.MediaMetadataCompat.Builder mb = new android.support.v4.media.MediaMetadataCompat.Builder();
                mb.putString(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle);
                mb.putString(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist);
                mb.putString(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum);
                Bitmap ab = null;
                try { ab = createCoverBitmap(currentFilePath); } catch (Throwable ignored) {}
                if (ab != null) mb.putBitmap(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_ALBUM_ART, ab);
                long dur = getExoDuration(); if (dur > 0) mb.putLong(android.support.v4.media.MediaMetadataCompat.METADATA_KEY_DURATION, dur);
                mediaSession.setMetadata(mb.build());
                int state = currentIsPlaying ? android.support.v4.media.session.PlaybackStateCompat.STATE_PLAYING : android.support.v4.media.session.PlaybackStateCompat.STATE_PAUSED;
                android.support.v4.media.session.PlaybackStateCompat.Builder sb = new android.support.v4.media.session.PlaybackStateCompat.Builder();
                sb.setActions(android.support.v4.media.session.PlaybackStateCompat.ACTION_PLAY | android.support.v4.media.session.PlaybackStateCompat.ACTION_PAUSE | android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_NEXT | android.support.v4.media.session.PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | android.support.v4.media.session.PlaybackStateCompat.ACTION_SEEK_TO | android.support.v4.media.session.PlaybackStateCompat.ACTION_STOP);
                sb.setState(state, getExoPosition(), 1f);
                mediaSession.setPlaybackState(sb.build());
            }
        } catch (Throwable t) {
            android.util.Log.e("AuraSound", "mediasession update failed", t);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_STOP_SERVICE.equals(action)) {
                if (exoPlayer != null) { exoPlayer.stop(); }
                abandonAudioFocus(); stopForeground(true); stopSelf();
                AuraSoundWidget.updateWidgetState(this, "AuraSound HD", "Lecteur Haute Définition", false, null);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(NOTIFICATION_ID);
                releaseWakeLock(); return START_NOT_STICKY;
            }
            if (ACTION_NATIVE_PLAY.equals(action)) {
                if (intent.hasExtra("title")) currentTitle = intent.getStringExtra("title");
                if (intent.hasExtra("artist")) currentArtist = intent.getStringExtra("artist");
                if (intent.hasExtra("album")) currentAlbum = intent.getStringExtra("album");
                if (intent.hasExtra("filePath")) currentFilePath = intent.getStringExtra("filePath");
                currentIsPlaying = true;
                doNativePlay(currentFilePath);
                updateNotificationOnly();
                return START_STICKY;
            }
            if (ACTION_NATIVE_PAUSE.equals(action)) {
                if (exoPlayer != null) exoPlayer.pause();
                currentIsPlaying = false;
                updateNotificationOnly();
                return START_STICKY;
            }
            if (ACTION_NATIVE_SEEK.equals(action)) {
                long pos = intent.getLongExtra("pos", 0);
                cachedPosition = pos;
                if (exoPlayer != null) exoPlayer.seekTo(pos);
                updateNotificationOnly();
                return START_STICKY;
            }
            if (intent.hasExtra("title")) currentTitle = intent.getStringExtra("title");
            if (intent.hasExtra("artist")) currentArtist = intent.getStringExtra("artist");
            if (intent.hasExtra("album")) currentAlbum = intent.getStringExtra("album");
            if (intent.hasExtra("filePath")) currentFilePath = intent.getStringExtra("filePath");
            if (intent.hasExtra("isPlaying")) currentIsPlaying = intent.getBooleanExtra("isPlaying", false);
        }
        if (currentIsPlaying) { acquireWakeLock(); requestAudioFocus(); }
        updateNotificationOnly();
        return START_STICKY;
    }

    private Bitmap createCoverBitmap(String filePath, int maxDim) {
        try {
            Bitmap b = createCoverBitmap(filePath);
            if (b != null && maxDim > 0 && (b.getWidth() > maxDim || b.getHeight() > maxDim)) {
                float scale = Math.min((float) maxDim / b.getWidth(), (float) maxDim / b.getHeight());
                return Bitmap.createScaledBitmap(b, Math.max(1,(int)(b.getWidth()*scale)), Math.max(1,(int)(b.getHeight()*scale)), true);
            }
            return b;
        } catch (Throwable t) { return null; }
    }

    private Bitmap createCoverBitmap(String filePath) {
        if (filePath != null && !filePath.isEmpty()) {
            byte[] art = null;
            // content:// : passer par un FileDescriptor (MediaMetadataRetriever.setDataSource
            // avec une URI en String peut provoquer un abort natif sur certains SoC MTK)
            if (filePath.startsWith("content://")) {
                try {
                    android.os.ParcelFileDescriptor pfd = getContentResolver().openFileDescriptor(Uri.parse(filePath), "r");
                    if (pfd != null) {
                        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                        mmr.setDataSource(pfd.getFileDescriptor());
                        art = mmr.getEmbeddedPicture();
                        mmr.release();
                        pfd.close();
                    }
                } catch (Throwable ignored) {}
            } else if (!filePath.startsWith("http")) {
                try {
                    MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                    mmr.setDataSource(filePath);
                    art = mmr.getEmbeddedPicture();
                    mmr.release();
                } catch (Throwable ignored) {}
            }
            if (art != null && art.length > 0) {
                try {
                    // Décodage borné : les pochettes FLAC peuvent faire 4000x4000 (+64 Mo RAM)
                    BitmapFactory.Options opts = new BitmapFactory.Options();
                    opts.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(art, 0, art.length, opts);
                    int sample = 1;
                    while ((opts.outWidth / sample) > 1024 || (opts.outHeight / sample) > 1024) sample *= 2;
                    opts.inJustDecodeBounds = false;
                    opts.inSampleSize = sample;
                    Bitmap o = BitmapFactory.decodeByteArray(art, 0, art.length, opts);
                    if (o != null) return getRoundedCornerBitmap(o, 32);
                } catch (Throwable ignored) {}
            }
        }
        int size=256; Bitmap b=Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888); Canvas c=new Canvas(b); Paint bg=new Paint(Paint.ANTI_ALIAS_FLAG); bg.setColor(0xFF0A0B0E); c.drawCircle(size/2f,size/2f,size/2f,bg); Paint g=new Paint(Paint.ANTI_ALIAS_FLAG); g.setStyle(Paint.Style.STROKE); g.setColor(0x18FFFFFF); g.setStrokeWidth(1.5f); for(int r=40;r<116;r+=14) c.drawCircle(size/2f,size/2f,r,g); Paint h=new Paint(Paint.ANTI_ALIAS_FLAG); h.setColor(0xFFE9E9E9); c.drawCircle(size/2f,size/2f,22,h); Paint d=new Paint(Paint.ANTI_ALIAS_FLAG); d.setColor(0xFF050607); c.drawCircle(size/2f,size/2f,7,d); return b;
    }
    private Bitmap getRoundedCornerBitmap(Bitmap bitmap, float pixels) {
        Bitmap output = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output); final int color = 0xff424242; final Paint paint = new Paint(); final android.graphics.Rect rect = new android.graphics.Rect(0, 0, bitmap.getWidth(), bitmap.getHeight()); final android.graphics.RectF rectF = new android.graphics.RectF(rect); paint.setAntiAlias(true); canvas.drawARGB(0, 0, 0, 0); paint.setColor(color); canvas.drawRoundRect(rectF, pixels, pixels, paint); paint.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN)); canvas.drawBitmap(bitmap, rect, rect, paint); return output;
    }
    private Notification buildNotification(String title, String artist, String album, String filePath, boolean isPlaying) {
        Intent openAppIntent = new Intent(this, MainActivity.class); openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP); PendingIntent openAppPending = PendingIntent.getActivity(this, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent prevIntent = new Intent(this, MediaNotificationReceiver.class); prevIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_PREV); PendingIntent prevPending = PendingIntent.getBroadcast(this, 10, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent playPauseIntent = new Intent(this, MediaNotificationReceiver.class); playPauseIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_PLAY_PAUSE); PendingIntent playPausePending = PendingIntent.getBroadcast(this, 11, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent nextIntent = new Intent(this, MediaNotificationReceiver.class); nextIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_NEXT); PendingIntent nextPending = PendingIntent.getBroadcast(this, 12, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent closeIntent = new Intent(this, MediaNotificationReceiver.class); closeIntent.setAction(MediaNotificationReceiver.ACTION_NOTIFICATION_CLOSE); PendingIntent closePending = PendingIntent.getBroadcast(this, 13, closeIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (mediaSession == null) initMediaSession();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher).setLargeIcon(createCoverBitmap(filePath, 320)).setContentTitle(title).setContentText(artist).setSubText(album)
                .setContentIntent(openAppPending).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setOngoing(isPlaying).setOnlyAlertOnce(true).setAutoCancel(false)
                .setColor(0xFFFFFFFF).setColorized(false).setShowWhen(false).setPriority(NotificationCompat.PRIORITY_LOW).setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(R.drawable.ic_prev_white, "Précédent", prevPending)
                .addAction(isPlaying ? R.drawable.ic_pause_white : R.drawable.ic_play_white, isPlaying ? "Pause" : "Lecture", playPausePending)
                .addAction(R.drawable.ic_next_white, "Suivant", nextPending)
                .setStyle(new MediaStyle().setMediaSession(mediaSession.getSessionToken()).setShowActionsInCompactView(0,1,2).setShowCancelButton(true).setCancelButtonIntent(closePending));
        return builder.build();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        super.onDestroy(); abandonAudioFocus();
        if (exoPlayer != null) { exoPlayer.release(); exoPlayer=null; }
        if (mediaSession != null) { mediaSession.setActive(false); mediaSession.release(); mediaSession=null; }
        releaseWakeLock(); instance=null;
    }
    @Override public void onTaskRemoved(Intent rootIntent) { if (!currentIsPlaying) { stopForeground(true); stopSelf(); } super.onTaskRemoved(rootIntent); }
}
