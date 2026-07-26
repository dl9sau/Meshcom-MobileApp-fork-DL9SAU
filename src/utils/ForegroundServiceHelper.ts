import { Capacitor } from '@capacitor/core';
import { ForegroundService, ServiceType } from '@capawesome-team/capacitor-android-foreground-service';
import { Geolocation } from '@capacitor/geolocation';
import LogS from './LogService';

// Keeps the app process (and thus the WebView JS + BLE connection + message
// processing) alive while the app is backgrounded, so notifications fire even in
// the background. Android requires a foreground service (persistent notification)
// for this. The plugin only offers "location"/"microphone" service types; we use
// LOCATION - honest here, since MeshCom genuinely uses GPS (position beaconing),
// and it lets GPS/beaconing keep running in the background too. Android only.
//
// Three things Android needs before the persistent icon actually shows and the
// service is allowed to start (all were missing before, hence: no icon + no GPS
// prompt):
//   1. serviceType = Location passed to startForegroundService() - Android 14+
//      rejects a typeless foreground service (MissingForegroundServiceType).
//   2. POST_NOTIFICATIONS granted (Android 13+) - without it the FG notification
//      is silently hidden even though the service runs.
//   3. location permission granted - a *location*-type FG service is refused on
//      Android 14+ unless ACCESS_(FINE|COARSE)_LOCATION is held. Requesting it
//      here is also the GPS prompt users expect.
//
// LICENSE NOTE: this uses the MIT-licensed @capawesome-team plugin. A hand-written
// native Kotlin service is envisioned later to be independent of external licenses.

const FG_CHANNEL = 'meshcom-fg';
const FG_ID = 4711;

let fgRunning = false;

export async function startForeground(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    if (fgRunning) return;

    // (2) notification permission (Android 13+) - required or the icon stays hidden
    try {
        const perm = await ForegroundService.checkPermissions();
        LogS.log(0, 'FG notif perm: ' + JSON.stringify(perm));
        if ((perm as any)?.display !== 'granted') {
            const req = await ForegroundService.requestPermissions();
            LogS.log(0, 'FG notif perm (after request): ' + JSON.stringify(req));
        }
    } catch (e) {
        LogS.log(1, 'FG notif perm error: ' + JSON.stringify(e) + ' / ' + (e as any)?.message);
    }

    // (3) location permission - needed for a location-type FG service on Android 14+,
    // and this is the GPS prompt the user expects (position beaconing + background).
    try {
        const lperm = await Geolocation.checkPermissions();
        LogS.log(0, 'FG loc perm: ' + JSON.stringify(lperm));
        if (lperm?.location !== 'granted' && lperm?.coarseLocation !== 'granted') {
            const lreq = await Geolocation.requestPermissions();
            LogS.log(0, 'FG loc perm (after request): ' + JSON.stringify(lreq));
        }
    } catch (e) {
        LogS.log(1, 'FG loc perm error: ' + JSON.stringify(e) + ' / ' + (e as any)?.message);
    }

    try {
        // low-importance, silent channel for the persistent "running" notification
        await ForegroundService.createNotificationChannel({
            id: FG_CHANNEL,
            name: 'MeshCom background',
            importance: 2, // LOW -> shown but silent + collapsible
        } as any);
    } catch (e) {
        // channel may already exist, or the method name differs across versions
        LogS.log(1, 'FG channel: ' + JSON.stringify(e) + ' / ' + (e as any)?.message);
    }

    try {
        await ForegroundService.startForegroundService({
            id: FG_ID,
            title: 'MeshCom',
            body: 'Connected — keeping the mesh alive in the background',
            smallIcon: 'ic_stat_notify',
            notificationChannelId: FG_CHANNEL,
            serviceType: ServiceType.Location, // (1) Android 14+ requires a type
        } as any);
        fgRunning = true;
        LogS.log(0, 'FG service started');
    } catch (e) {
        LogS.log(1, 'FG start error: ' + JSON.stringify(e) + ' / ' + (e as any)?.message);
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
