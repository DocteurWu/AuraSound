package com.aurasound.musicplayer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

public class AuraSoundWidget extends AppWidgetProvider {

    public static final String ACTION_WIDGET_PLAY_PAUSE = "com.aurasound.ACTION_WIDGET_PLAY_PAUSE";
    public static final String ACTION_WIDGET_NEXT = "com.aurasound.ACTION_WIDGET_NEXT";
    public static final String ACTION_WIDGET_PREV = "com.aurasound.ACTION_WIDGET_PREV";

    private static String currentTitle = "AuraSound HD";
    private static String currentArtist = "Lecteur Haute Définition";
    private static boolean isPlaying = false;
    private static Bitmap currentArt = null;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateWidgetState(Context context, String title, String artist, boolean playing, Bitmap artwork) {
        currentTitle = (title != null && !title.isEmpty()) ? title : "AuraSound HD";
        currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Lecteur Haute Définition";
        isPlaying = playing;
        if (artwork != null) {
            currentArt = artwork;
        }

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, AuraSoundWidget.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        if (appWidgetIds != null && appWidgetIds.length > 0) {
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    private static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_aurasound);

        views.setTextViewText(R.id.widget_track_title, currentTitle);
        views.setTextViewText(R.id.widget_track_artist, currentArtist);
        views.setImageViewResource(R.id.widget_btn_play_pause, isPlaying ? R.drawable.ic_pause_white : R.drawable.ic_play_white);

        if (currentArt != null) {
            views.setImageViewBitmap(R.id.widget_icon, currentArt);
        } else {
            views.setImageViewResource(R.id.widget_icon, R.mipmap.ic_launcher);
        }

        // Click on widget opens app
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
                context, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_container, openPendingIntent);

        // Play/Pause button
        Intent playPauseIntent = new Intent(context, MediaNotificationReceiver.class);
        playPauseIntent.setAction(ACTION_WIDGET_PLAY_PAUSE);
        PendingIntent playPausePending = PendingIntent.getBroadcast(
                context, 1, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_play_pause, playPausePending);

        // Prev button
        Intent prevIntent = new Intent(context, MediaNotificationReceiver.class);
        prevIntent.setAction(ACTION_WIDGET_PREV);
        PendingIntent prevPending = PendingIntent.getBroadcast(
                context, 2, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_prev, prevPending);

        // Next button
        Intent nextIntent = new Intent(context, MediaNotificationReceiver.class);
        nextIntent.setAction(ACTION_WIDGET_NEXT);
        PendingIntent nextPending = PendingIntent.getBroadcast(
                context, 3, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_btn_next, nextPending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}