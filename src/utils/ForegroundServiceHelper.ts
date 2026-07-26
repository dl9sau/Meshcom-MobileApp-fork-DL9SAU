import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

// Keeps the app process (and thus the WebView JS + BLE connection + message
// processing) alive while the app is backgrounded, so notifications fire even in
// the background. Android requires a foreground service (persistent notification)
// for this. The plugin only offers "location"/"microphone" service types; we use
// LOCATION - honest here, since MeshCom genuinely uses GPS (position beaconing),
// and it lets GPS/beaconing keep running in the background too. Android only.
//
// LICENSE NOTE: this uses the MIT-licensed @capawesome-team plugin. A hand-written
// native Kotlin service is envisioned later to be independent of external licenses.

const FG_CHANNEL = 'meshcom-fg';
const FG_ID = 4711;

let fgRunning = false;

export async function startForeground(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    if (fgRunning) return;
    try {
        // low-importance, silent channel for the persistent "running" notification
        await ForegroundService.createNotificationChannel({
            id: FG_CHANNEL,
            name: 'MeshCom background',
            importance: 2, // LOW -> shown but silent + collapsible
        } as any);
    } catch (e) {
        // channel may already exist, or the method name differs across versions
        console.log('FG channel:', e);
    }
    try {
        await ForegroundService.startForegroundService({
            id: FG_ID,
            title: 'MeshCom',
            body: 'Connected — keeping the mesh alive in the background',
            smallIcon: 'ic_stat_notify',
            notificationChannelId: FG_CHANNEL,
        } as any);
        fgRunning = true;
        console.log('FG service started');
    } catch (e) {
        console.log('FG start error:', e);
    }
}

export async function stopForeground(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    if (!fgRunning) return;
    try {
        await ForegroundService.stopForegroundService();
        fgRunning = false;
        console.log('FG service stopped');
    } catch (e) {
        console.log('FG stop error:', e);
    }
}
