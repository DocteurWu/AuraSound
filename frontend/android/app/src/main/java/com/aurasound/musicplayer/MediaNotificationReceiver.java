package com.aurasound.musicplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MediaNotificationReceiver extends BroadcastReceiver {

    public static final String ACTION_NOTIFICATION_PLAY_PAUSE = "com.aurasound.ACTION_NOTIFICATION_PLAY_PAUSE";
    public static final String ACTION_NOTIFICATION_NEXT = "com.aurasound.ACTION_NOTIFICATION_NEXT";
    public static final String ACTION_NOTIFICATION_PREV = "com.aurasound.ACTION_NOTIFICATION_PREV";
    public static final String ACTION_NOTIFICATION_CLOSE = "com.aurasound.ACTION_NOTIFICATION_CLOSE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        String command = "";

        if (action.equals(ACTION_NOTIFICATION_PLAY_PAUSE) || action.equals(AuraSoundWidget.ACTION_WIDGET_PLAY_PAUSE)) {
            command = "playPause";
        } else if (action.equals(ACTION_NOTIFICATION_NEXT) || action.equals(AuraSoundWidget.ACTION_WIDGET_NEXT)) {
            command = "next";
        } else if (action.equals(ACTION_NOTIFICATION_PREV) || action.equals(AuraSoundWidget.ACTION_WIDGET_PREV)) {
            command = "prev";
        } else if (action.equals(ACTION_NOTIFICATION_CLOSE)) {
            command = "stop";
            MediaStoreAudioPlugin.clearNotification(context);
        }

        if (!command.isEmpty()) {
            MediaStoreAudioPlugin.dispatchMediaAction(command);
        }
    }
}