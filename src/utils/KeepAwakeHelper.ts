import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import LogS from './LogService';

// "Monitoring mode": keep the screen on (Android FLAG_KEEP_SCREEN_ON via the
// MIT @capacitor-community/keep-awake plugin - no special permission). While the
// app is the visible foreground and the screen stays lit, the WebView JS is never
// paused, so messages are processed and notifications fire live - no Doze gap.
// Only meaningful while the app is in the foreground; we release it otherwise.

export async function applyKeepAwake(on: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
        const sup = await KeepAwake.isSupported();
        if (!sup?.isSupported) return;
        if (on) await KeepAwake.keepAwake();
        else await KeepAwake.allowSleep();
        LogS.log(0, 'KeepAwake: ' + (on ? 'screen kept on' : 'sleep allowed'));
    } catch (e) {
        LogS.log(1, 'KeepAwake error: ' + JSON.stringify(e) + ' / ' + (e as any)?.message);
    }
}
