# Android

The Android app is a Capacitor 8 project in `apps/mobile/android` wrapping the web UI. The
`DaikinNet` plugin (`DaikinNetPlugin.java`) provides LAN HTTP(S) and UDP discovery.

Build locally (JDK 21, Android SDK 36):

```bash
npm ci && npm run android:sync
cd apps/mobile/android && ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Release signing – create a keystore once:

```bash
keytool -genkeypair -v -keystore remo.keystore -alias remo -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 remo.keystore   # → secret ANDROID_KEYSTORE_BASE64
```

Add repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`. Without them CI signs release builds with the debug key (installable, but
not suitable for the Play Store). The version name comes from the root `package.json`; the version
code is the CI run number.

Permissions: Internet, network/Wi-Fi state and multicast (discovery), notifications (alerts).
Cleartext HTTP is allowed because adapters only speak HTTP on the LAN; the plugin refuses public
hosts other than the Daikin cloud.
