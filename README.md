<div align="center">

# 🎧 AuraSound HD
### *Lecteur Musical Audiophile & Expérience Visuelle Futuriste pour Android & Web*

[![Version](https://img.shields.io/badge/version-2.4-00f2fe?style=for-the-badge&logo=android)](https://github.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android-1199EE?style=for-the-badge&logo=capacitor)](https://capacitorjs.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-purple?style=for-the-badge)](LICENSE)

<br/>

**AuraSound** est un lecteur de musique moderne, ultra-rapide et immersif conçu pour Android et le Web. Il combine un moteur audio haute-fidélité, des visualisations réactives aux basses, un égaliseur 5 bandes professionnel, un widget d'écran d'accueil natif et des statistiques d'écoute avancées avec zéro latence.

</div>

---

## ✨ Fonctionnalités Majeures

### 🎵 1. Moteur Audio Audiophile & 100% Autonome
* **Détection automatique instantanée** : Scan natif du stockage Android (`MediaStore`) pour indexer tous vos morceaux (`.mp3`, `.m4a`, `.flac`, `.opus`, `.wav`).
* **Lecture ininterrompue en arrière-plan** : `Partial WakeLock` + persistance des timers audio pour une écoute sans coupure écran verrouillé.
* **Égaliseur Studio Pro 5 Bandes** : Contrôle précis des fréquences (60Hz, 250Hz, 1kHz, 4kHz, 16kHz) avec préamplification et réverbération.
* **Contrôles Casque & Bluetooth AVRCP** : Prise en charge des boutons d'écouteurs et casques Bluetooth (Play/Pause, Next, Prev).

---

### 🎨 2. Design Visuel & Rendu Futuriste
* **Thèmes Cyberpunk & AMOLED** : 4 palettes immersives (*Cyber Neon, Violet Astral, Rouge Éclipse, Vert Matrix*).
* **Vinyle Tournant & Visualiseur Dynamique** : Disque vinyle haute définition avec reflets lumineux et fallback néon si aucune pochette n'est présente.
* **Widget Flottant Déplaçable** : Lecteur compact avec rendu audio-réactif sur votre écran.
* **Navigation Naturelle** : Prise en charge intelligente du bouton Retour Android pour fermer le lecteur et revenir à la bibliothèque sans jamais couper la musique.

---

### 📱 3. Intégrations Système Android Natives
* **Bannière Lockscreen & Notifications `MediaStyle`** : Affichage colorisé AMOLED avec pochette d'album haute résolution et boutons de contrôle interactifs.
* **Widget Écran d'Accueil (Home Screen Widget)** : Contrôlez votre musique directement depuis le bureau Android avec aperçu de la pochette et titre en direct.
* **Optimisation Batterie & Superposition** : Whitelistée contre la mise en veille Doze de Xiaomi/Android et compatible avec l'affichage en superposition (`SYSTEM_ALERT_WINDOW`).

---

### 📊 4. Statistiques d'Écoute & Playlists Intelligentes
* **Analytique en temps réel** : Temps total d'écoute, Top artistes, Top morceaux et courbe de répartition horaire.
* **Playlists personnalisées & Smart Favorites** : Gestion complète de playlists avec regroupement automatique des **« ❤️ Coups de Cœur »**.

---

## 🛠️ Architecture Technique

```
lecteur-music-hehe/
├── frontend/                     # Interface React 18 + Vite + TailwindCSS
│   ├── src/
│   │   ├── components/           # Composants UI (Library, Player, Equalizer, Playlists, Analytics)
│   │   ├── services/             # AudioEngine, WebSocket, Thèmes, API
│   │   └── App.jsx               # Orchestration principale et hooks système
│   └── android/                  # Projet Android Studio natif (Capacitor 6)
│       └── app/src/main/
│           ├── java/com/aurasound/musicplayer/
│           │   ├── MainActivity.java             # Cycle de vie, WakeLock, Back Navigation
│           │   ├── MediaStoreAudioPlugin.java    # Scan local, Notification MediaStyle & Lockscreen
│           │   ├── AuraSoundWidget.java          # Widget natif pour l'écran d'accueil
│           │   └── MediaNotificationReceiver.java # Récepteur de commandes multimédia
│           └── res/                              # Layouts, drawables vectoriels, widget_info
├── backend/                      # Serveur Node.js / Express / SQLite (optionnel)
└── README.md                     # Documentation officielle
```

---

## 🚀 Installation & Développement

### Prérequis
* Node.js 18+ & npm
* Android Studio (SDK Android 30+)
* Java JDK 17+ (`JAVA_HOME`)

### 1. Cloner le projet
```bash
git clone https://github.com/hamlat-louai/AuraSound.git
cd AuraSound
```

### 2. Installer les dépendances du frontend
```bash
cd frontend
npm install
```

### 3. Lancer en mode Web Dev
```bash
npm run dev
```

### 4. Compiler et déployer l'APK sur Android
```bash
# Compilation du bundle web
npm run build

# Synchronisation avec Android
npx cap copy android
npx cap sync android

# Compilation de l'APK Debug avec Gradle
cd android
./gradlew assembleDebug

# Installation directe sur appareil connecté (ADB)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 📄 Licence

Distribué sous la licence **MIT**. Voir `LICENSE` pour plus de détails.

<div align="center">
  <b>Conçu avec passion pour les passionnés de musique 🎶</b>
</div>