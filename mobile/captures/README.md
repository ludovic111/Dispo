# Captures comparatives

Les PNG générés dans ce dossier sont ignorés par Git. Ils servent de preuves
locales, pas d’assets applicatifs.

Avant la capture, installer et ouvrir une première fois `Dispo Dev` sur un
simulateur iOS et sur l’AVD Android, puis démarrer Metro pour l’APK Debug.

```bash
export DISPO_IOS_DEVICE_ID=<UDID du simulateur démarré>
export DISPO_ANDROID_SERIAL=emulator-5554
npm run capture:auth
```

Le script force la locale française et produit les variantes clair/sombre du
shell d’authentification. La référence SwiftUI reste à capturer séparément avec
le même appareil logique, la même locale et le même thème.
