import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Own package name, NOT upstream's 'io.ionic.meshcom' (which is the Ionic template
  // namespace anyway). Same id = same app to Android: the fork could only be installed
  // by uninstalling the original first, which is a hard barrier for testers (field
  // report, 2026-08-31). With this, both sit side by side.
  // Cost, once: an existing install stays behind as a separate app and stops getting
  // updates - settings and the Android notification settings have to be set again.
  appId: 'de.dl9sau.meshcom',
  appName: 'MeshCom DL9SAU',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
      // Only the tint here. Upstream (b8189cf) also sets `smallIcon` in this block, but
      // ours is better placed: the CI builds `ic_stat_notify` from resources/icon.png at
      // build time (there is no android/ folder in the repo), and every notification names
      // it explicitly - upstream's `res://drawable/meshcom_logo_32x32_transp_gray` does not
      // exist here. `sound` is not taken either: on Android O+ the sound comes from the
      // channel ('banner'/'sound', see Chat.tsx), and iOS gets it per notification.
      // `presentationOptions` would show iOS banners while the app is in the FOREGROUND -
      // that contradicts our in-app beep (quiet unless idle, no shade entry).
      LocalNotifications: {
        iconColor: '#3578e5',
      },
      Keyboard: {
        resize: 'ionic',
        resizeOnFullScreen: false,
      },
      CapacitorSQLite: {
        iosDatabaseLocation: 'Library/CapacitorDatabase',
        iosIsEncryption: false,
        iosKeychainPrefix: 'ionic7-react-sqlite-app',
        iosBiometric: {
            biometricAuth: false,
            biometricTitle : "Biometric login for capacitor sqlite"
        },
        androidIsEncryption: false,
        androidBiometric: {
            biometricAuth : false,
            biometricTitle : "Biometric login for capacitor sqlite",
            biometricSubTitle : "Log in using your biometric"
        },
        electronIsEncryption: false,
        electronWindowsLocation: "C:\\ProgramData\\CapacitorDatabases",
        electronMacLocation: "/Volumes/Development_Lacie/Development/Databases",
        electronLinuxLocation: "Databases"
        }
    }
};

export default config;
