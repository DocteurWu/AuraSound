import { api } from './api';

// Identifiant d'appareil generique derive du navigateur
const DEVICE_INFO = typeof navigator !== 'undefined'
  ? `${(navigator.platform || 'web').slice(0, 40)} · AuraSound`
  : 'AuraSound';

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.equalizerFilters = [];
    this.gainNode = null;

    // Telemetry state
    this.currentTrack = null;
    this.sessionStartTime = null;
    this.listenedTimeMs = 0;
    this.lastTickTime = null;
    this.isSessionActive = false;
    this.hasSentTelemetry = false;

    // Playback state
    this.isPlaying = false;
    this.queue = [];
    this.queueIndex = -1;
    this.shuffleMode = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.shuffledIndices = [];

    // Battery saver state (stops visualizer loops when screen is off)
    this.isScreenVisible = true;

    // Erreurs de lecture consecutives (pour eviter les boucles de saut)
    this.consecutiveErrors = 0;

    // ExoPlayer natif Hi-Res state
    this.useNative = true; // ExoPlayer content:// + fallback WebAudio si error event
    this.nativeActive = false;
    this.nativePosition = 0;
    this.nativeDuration = 0;
    this.nativePollTimer = null;

    // Listeners
    this.listeners = new Set();
    this.notifyThrottleTimer = null;

    this.initAudioEvents();
    this.initHardwareHeadsetKeys();
    this.initBatterySaverAndVisibility();
    this.initNativeBridgeActions();
  }

  isNativeAvailable() {
    return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio && window.Capacitor.Plugins.MediaStoreAudio.playNative);
  }

  initNativeBridgeActions() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try {
        window.Capacitor.Plugins.MediaStoreAudio.addListener('mediaAction', (data) => {
          if (!data || !data.action) return;
          if (data.action === 'playPause') this.togglePlayPause();
          else if (data.action === 'next') this.nextTrack();
          else if (data.action === 'prev') this.prevTrack();
          else if (data.action === 'stop' || data.action === 'pause') {
            if (this.nativeActive) { try{ window.Capacitor.Plugins.MediaStoreAudio.pauseNative(); }catch(e){} this.isPlaying=false; this.notifyListeners(); }
            else this.audio.pause();
          }
        });
        window.Capacitor.Plugins.MediaStoreAudio.addListener('exoEvent', (data) => {
          if (!data) return;
          if (data.event === 'playing') { this.isPlaying = true; this.consecutiveErrors=0; this.lastTickTime = Date.now(); this.updateMediaSessionState('playing'); this.startPollingNative(); this.notifyListeners(); }
          else if (data.event === 'paused') { this.isPlaying = false; this.accumulateListenedTime(); this.updateMediaSessionState('paused'); this.stopPollingNative(); this.notifyListeners(); }
          else if (data.event === 'ended') { // fin naturelle : télémétrie COMPLÈTE puis morceau suivant
            this.stopPollingNative();
            this.handleTrackEnded();
          }
          else if (data.event === 'error') {
            // ExoPlayer a échoué : basculer proprement sur WebAudio si c'était la piste en attente
            console.warn('ExoPlayer error – fallback WebAudio');
            this.nativeActive = false;
            this.stopPollingNative();
            const pendingId = this._pendingNativeTrackId;
            this._pendingNativeTrackId = null;
            if (pendingId && this.currentTrack && this.currentTrack.id === pendingId) {
              this.playWebAudioFallback(this.currentTrack);
            } else if (this.queue.length > 1 && this.consecutiveErrors <= 3) {
              this.consecutiveErrors += 1;
              setTimeout(() => this.nextTrack(), 300);
            }
          }
        });
      } catch (e) { console.warn('Native listener setup:', e); }
    }
    try { this.restorePersistedState(); } catch(e){}
  }

  startPollingNative() {
    this.stopPollingNative();
    this.nativePollTimer = setInterval(async () => {
      if (!this.nativeActive || !this.isPlaying) return;
      try {
        if (this.isNativeAvailable()) {
          const s = await window.Capacitor.Plugins.MediaStoreAudio.getNativeState();
          if (s) { this.nativePosition = s.position || 0; this.nativeDuration = s.duration || this.currentTrack?.duration || 0; this.currentTimeOverride = this.nativePosition; this.scheduleNotify(); }
        }
      } catch(e){}
    }, 500);
  }
  stopPollingNative() { if (this.nativePollTimer) { clearInterval(this.nativePollTimer); this.nativePollTimer=null; } }

  // Initialisation paresseuse du Web Audio Context
  initAudioContext() {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.75;

      this.gainNode = this.audioCtx.createGain();

      // 5-Band Equalizer: 60Hz, 250Hz, 1kHz, 4kHz, 16kHz
      const freqs = [60, 250, 1000, 4000, 16000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      this.equalizerFilters = freqs.map((f, i) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = f;
        filter.gain.value = 0;
        return filter;
      });

      this.source = this.audioCtx.createMediaElementSource(this.audio);

      let lastNode = this.source;
      this.equalizerFilters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });

      lastNode.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      console.log('🎵 Moteur Web Audio Studio Pro & Bluetooth AVRCP actif');
    } catch (e) {
      console.warn('Web Audio API mode standard:', e.message);
    }
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.lastTickTime = Date.now();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(()=>{});
      }
      this.updateMediaSessionState('playing');
      this.persistState();
      this.notifyListeners();
    });

    this.audio.addEventListener('playing', () => {
      this.consecutiveErrors = 0;
    });

    this.audio.addEventListener('pause', () => {
      this.accumulateListenedTime();
      this.isPlaying = false;
      this.updateMediaSessionState('paused');
      this.persistState();
      this.notifyListeners();
    });

    // Sauvegarde périodique de la progression (pour reprise après kill)
    this.audio.addEventListener('timeupdate', () => {
      if (this.isPlaying) {
        this.accumulateListenedTime();
      }
      // Throttle : evite de re-rendre toute l'UI a chaque tick (~4x/s)
      this.scheduleNotify();
      // Persist every ~10s en lecture
      if (this.isPlaying && Math.floor(this.audio.currentTime) % 10 === 0) {
        this.persistState();
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Erreur lecture audio:', e);
      this.consecutiveErrors += 1;
      // Saute automatiquement au morceau suivant si le fichier est illisible
      // (max 3 sauts consecutifs pour ne pas boucler sur une file corrompue)
      if (this.queue.length > 1 && this.consecutiveErrors <= 3) {
        setTimeout(() => this.nextTrack(), 300);
        return;
      }
      this.isPlaying = false;
      this.notifyListeners();
    });
  }

  // Support des touches materielles de casque / Bluetooth (AVRCP)
  initHardwareHeadsetKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'MediaTrackNext') {
        e.preventDefault();
        this.nextTrack();
      } else if (e.key === 'MediaTrackPrevious') {
        e.preventDefault();
        this.prevTrack();
      } else if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay' || e.key === 'MediaPause') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.key === 'MediaStop') {
        e.preventDefault();
        this.audio.pause();
      }
    });
  }

  // Économie de batterie : coupe les rendus graphiques quand l'écran est éteint + gestion AudioContext
  initBatterySaverAndVisibility() {
    document.addEventListener('visibilitychange', () => {
      this.isScreenVisible = !document.hidden;
      // Suspendre proprement le WebAudio quand l'écran est éteint pour éviter crash, mais garder audio element actif
      // Le Foreground Service garde le CPU, on ne coupe pas la lecture
      if (document.hidden) {
        // Ne pas suspendre si en lecture – l'analyser consomme CPU inutilement, on garde le son
        // On laisse l'audio element tourner, juste on réduit la fréquence de notify
      } else {
        if (this.audioCtx && this.audioCtx.state === 'suspended' && this.isPlaying) {
          this.audioCtx.resume().catch(()=>{});
        }
      }
      this.notifyListeners();
    });

    // Persistance automatique avant fermeture
    window.addEventListener('beforeunload', () => this.persistState());
    // Pause si casque débranché (becoming noisy) – relayé aussi par le Service natif via mediaAction
    window.addEventListener('aurasound_permissions_granted', () => {
      console.log('Permissions accordées – rescan possible');
    });
  }

  // Persistance locale de la file et de la position pour reprise instantanée
  persistState() {
    try {
      const data = {
        queue: this.queue,
        queueIndex: this.queueIndex,
        currentTrack: this.currentTrack,
        currentTime: this.audio.currentTime || 0,
        isPlaying: this.isPlaying,
        shuffleMode: this.shuffleMode,
        repeatMode: this.repeatMode,
        volume: this.audio.volume,
        ts: Date.now()
      };
      localStorage.setItem('aurasound_playback_state', JSON.stringify(data));
    } catch(e){}
  }

  restorePersistedState() {
    try {
      const raw = localStorage.getItem('aurasound_playback_state');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Expire après 24h
      if (Date.now() - (data.ts||0) > 24*60*60*1000) return null;
      if (data.queue) this.queue = data.queue;
      if (typeof data.queueIndex === 'number') this.queueIndex = data.queueIndex;
      if (data.currentTrack) this.currentTrack = data.currentTrack;
      if (typeof data.shuffleMode === 'boolean') this.shuffleMode = data.shuffleMode;
      if (data.repeatMode) this.repeatMode = data.repeatMode;
      if (typeof data.volume === 'number') this.audio.volume = data.volume;
      // Restaurer position après que src soit posé (fait dans App.jsx)
      return data;
    } catch(e){ return null; }
  }

  accumulateListenedTime() {
    if (!this.lastTickTime) return;
    const now = Date.now();
    const elapsed = now - this.lastTickTime;
    if (elapsed > 0 && elapsed < 2000) {
      this.listenedTimeMs += elapsed;
    }
    this.lastTickTime = now;
  }

  startTelemetrySession(track) {
    if (this.isSessionActive && !this.hasSentTelemetry && this.currentTrack) {
      this.sendTelemetry(true);
    }

    this.currentTrack = track;
    this.sessionStartTime = new Date().toISOString();
    this.listenedTimeMs = 0;
    this.lastTickTime = Date.now();
    this.isSessionActive = true;
    this.hasSentTelemetry = false;
  }

  async sendTelemetry(isSkipped = false) {
    if (!this.currentTrack || this.hasSentTelemetry) return;
    this.accumulateListenedTime();
    this.hasSentTelemetry = true;
    this.isSessionActive = false;

    const st = this.getState();
    const totalDuration = st.duration || this.currentTrack.duration || 1;
    const listenedSec = this.listenedTimeMs / 1000;
    const progressPct = Math.min(100, Math.round((listenedSec / totalDuration) * 1000) / 10);
    const completed = !isSkipped && (progressPct >= 88 || listenedSec >= (totalDuration * 0.88));
    const curPos = this.nativeActive ? this.nativePosition : this.audio.currentTime;

    const payload = {
      id_morceau: this.currentTrack.id,
      timestamp: this.sessionStartTime || new Date().toISOString(),
      duree_totale: totalDuration,
      duree_ecoutee: listenedSec,
      progression: progressPct,
      skippe: completed ? 0 : 1,
      moment_du_skip: isSkipped ? curPos : null,
      device_info: DEVICE_INFO
    };

    try {
      await api.recordTelemetry(payload);
    } catch (err) {
      console.warn('Erreur télémétrie:', err.message);
    }
  }

  async playTrack(track, queue = null) {
    if (queue) {
      this.queue = [...queue];
      this.queueIndex = this.queue.findIndex(t => t.id === track.id);
      this.regenerateShuffleIndices();
    } else if (this.queue.length === 0) {
      this.queue = [track];
      this.queueIndex = 0;
    }
    this.startTelemetrySession(track);
    this.currentTrack = track;
    this.isPlaying = true;
    // Track en cours de tentative native – utilisé par le handler 'error' exoEvent
    this._pendingNativeTrackId = track.id;

    // Try ExoPlayer Hi-Res natif pour fichiers locaux
    const tryNative = this.useNative && this.isNativeAvailable() && track.file_path;
    if (tryNative) {
      try {
        this.nativeActive = true;
        const res = await api.nativePlay(track);
        if (!res || res.success === false) throw new Error('playNative refused');
        this.setupMediaSession(track);
        this.persistState();
        this.notifyListeners();
        this.startPollingNative();
        return;
      } catch(e) { console.warn('Fallback WebAudio:', e?.message || e); this.nativeActive=false; }
    }

    // Fallback WebAudio (pour web dev ou si natif échoue)
    this.playWebAudioFallback(track);
  }

  playWebAudioFallback(track) {
    this.nativeActive = false;
    this.stopPollingNative();
    this.initAudioContext();
    const audioUrl = api.resolveAudioUrl(track);
    if (!audioUrl) { console.error('URL audio vide pour', track); return; }
    this.audio.src = audioUrl;
    try {
      const persisted = JSON.parse(localStorage.getItem('aurasound_playback_state')||'{}');
      if (persisted.currentTrack && persisted.currentTrack.id === track.id && persisted.currentTime > 5) {
        setTimeout(()=> { try{ this.audio.currentTime = persisted.currentTime; }catch(e){} }, 300);
      }
    } catch(e){}
    this.audio.play().catch(e => console.warn('Lecture auto bloquée:', e.message || e));
    this.setupMediaSession(track);
    this.persistState();
    this.notifyListeners();
  }

  togglePlayPause() {
    if (this.nativeActive && this.isNativeAvailable()) {
      if (this.isPlaying) { try{ window.Capacitor.Plugins.MediaStoreAudio.pauseNative(); }catch(e){} this.isPlaying=false; this.stopPollingNative(); this.updateMediaSessionState('paused'); }
      else { // resume natif
        if (this.currentTrack) { api.nativePlay(this.currentTrack).catch(()=>{}); this.isPlaying=true; this.updateMediaSessionState('playing'); this.startPollingNative(); }
      }
      this.notifyListeners(); this.persistState(); return;
    }
    this.initAudioContext();
    if (!this.audio.src) {
      if (this.queue.length > 0) { this.playTrack(this.queue[0], this.queue); }
      return;
    }
    if (this.audio.paused) this.audio.play(); else this.audio.pause();
  }

  // Prochain index dans la file, en tenant compte du shuffle et du repeat
  getNextIndex(direction) {
    const n = this.queue.length;
    const order = (this.shuffleMode && this.shuffledIndices.length === n)
      ? this.shuffledIndices
      : this.queue.map((_, i) => i);
    let pos = order.indexOf(this.queueIndex) + direction;
    if (pos >= n) {
      if (this.repeatMode !== 'all') return -1;
      pos = 0;
    }
    if (pos < 0) pos = n - 1;
    return order[pos];
  }

  nextTrack() {
    if (this.queue.length === 0) return;
    this.sendTelemetry(true);
    if (this.repeatMode === 'one') {
      if (this.nativeActive) { this.seek(0); return; }
      this.audio.currentTime = 0; this.audio.play(); return;
    }
    const nextIdx = this.getNextIndex(1);
    if (nextIdx === -1) { this.isPlaying = false; this.stopPollingNative(); this.notifyListeners(); return; }
    this.queueIndex = nextIdx; this.playTrack(this.queue[nextIdx]);
  }
  prevTrack() {
    if (this.queue.length === 0) return;
    const curPos = this.nativeActive ? this.nativePosition : this.audio.currentTime;
    if (curPos > 3) { this.seek(0); return; }
    this.sendTelemetry(true);
    const prevIdx = this.getNextIndex(-1);
    this.queueIndex = prevIdx; this.playTrack(this.queue[prevIdx]);
  }

  handleTrackEnded() {
    this.sendTelemetry(false);

    if (this.repeatMode === 'one') {
      if (this.nativeActive && this.isNativeAvailable()) {
        this.seek(0);
        api.nativePlay(this.currentTrack).catch(()=>{});
        this.isPlaying = true;
        this.startPollingNative();
        return;
      }
      this.audio.currentTime = 0;
      this.audio.play();
      return;
    }

    this.nextTrack();
  }

  seek(seconds) {
    if (isNaN(seconds)) return;
    if (this.nativeActive && this.isNativeAvailable()) {
      api.nativeSeek(seconds).catch(()=>{});
      this.nativePosition = seconds;
      this.scheduleNotify();
      return;
    }
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
  }
  setVolume(vol) {
    const v = Math.max(0, Math.min(1, vol));
    this.audio.volume = v;
    if (this.nativeActive && this.isNativeAvailable()) {
      // ExoPlayer volume via native – pour l'instant on laisse WebAudio
      try { if (window.Capacitor.Plugins.MediaStoreAudio.setNativeVolume) window.Capacitor.Plugins.MediaStoreAudio.setNativeVolume({ volume: v }); } catch(e){}
    }
    this.notifyListeners();
  }

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    if (this.shuffleMode) {
      this.regenerateShuffleIndices();
    }
    this.notifyListeners();
  }

  cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[nextIdx];
    this.notifyListeners();
  }

  // Melange : le morceau courant reste en tete, le reste est melange
  regenerateShuffleIndices() {
    if (!this.shuffleMode || this.queue.length === 0) return;
    const rest = this.queue.map((_, i) => i).filter(i => i !== this.queueIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.shuffledIndices = (this.queueIndex >= 0 ? [this.queueIndex] : []).concat(rest);
  }

  setEqualizerBand(bandIndex, gainValue) {
    if (this.equalizerFilters[bandIndex]) {
      this.equalizerFilters[bandIndex].gain.value = gainValue;
    }
  }

  applyEQPreset(gains = [0, 0, 0, 0, 0]) {
    gains.forEach((g, i) => this.setEqualizerBand(i, g));
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(64);
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);
    return buffer;
  }

  // Intégration MediaSession API Complète (Casque Bluetooth, Écran de verrouillage, Boutons oreillettes)
  setupMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    const thumbUrl = track.thumbnail_path
      ? api.resolveMediaUrl(track.thumbnail_path)
      : '/logo.svg';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'AuraSound',
      artist: track.artist || 'Artiste inconnu',
      album: track.album || 'AuraSound HD',
      artwork: [
        { src: thumbUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    // Gestionnaires de commandes casque & Bluetooth (Simple/Double/Triple clic oreillette)
    const actionHandlers = [
      ['play', () => this.togglePlayPause()],
      ['pause', () => this.togglePlayPause()],
      ['stop', () => this.audio.pause()],
      ['previoustrack', () => this.prevTrack()],
      ['nexttrack', () => this.nextTrack()],
      ['seekbackward', (d) => this.seek(this.audio.currentTime - (d.seekOffset || 10))],
      ['seekforward', (d) => this.seek(this.audio.currentTime + (d.seekOffset || 10))],
      ['seekto', (d) => { if (d.seekTime !== undefined) this.seek(d.seekTime); }]
    ];

    actionHandlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {
        console.warn(`Action MediaSession ${action} non supportée`);
      }
    });

    this.updateMediaSessionState('playing');
  }

  updateMediaSessionState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
      try {
        if (this.audio.duration && !isNaN(this.audio.duration)) {
          navigator.mediaSession.setPositionState({
            duration: this.audio.duration,
            playbackRate: this.audio.playbackRate,
            position: this.audio.currentTime
          });
        }
      } catch (e) {}
    }

    // Mise à jour de la bannière système Android & Lockscreen & Widget
    if (this.currentTrack) {
      api.updateNativeNotification({
        title: this.currentTrack.title,
        artist: this.currentTrack.artist,
        album: this.currentTrack.album,
        filePath: this.currentTrack.file_path,
        isPlaying: state === 'playing'
      });
    }
  }

  // Met a jour le morceau courant (ex: favori) et notifie l'UI
  updateCurrentTrack(patch) {
    if (!this.currentTrack) return;
    this.currentTrack = { ...this.currentTrack, ...patch };
    // maj aussi dans la queue
    if (this.queueIndex >=0 && this.queue[this.queueIndex] && this.queue[this.queueIndex].id === this.currentTrack.id) {
      this.queue[this.queueIndex] = { ...this.queue[this.queueIndex], ...patch };
    }
    this.persistState();
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notification throttlee (max ~2x/s) pour les mises a jour de progression
  scheduleNotify() {
    if (this.notifyThrottleTimer) return;
    this.notifyThrottleTimer = setTimeout(() => {
      this.notifyThrottleTimer = null;
      this.notifyListeners();
    }, 500);
  }

  notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }

  getState() {
    const curTime = this.nativeActive ? (this.nativePosition || 0) : (this.audio.currentTime || 0);
    const dur = this.nativeActive ? (this.nativeDuration || this.currentTrack?.duration || 0) : (this.audio.duration || (this.currentTrack ? this.currentTrack.duration : 0));
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      currentTime: curTime,
      duration: dur,
      volume: this.audio.volume,
      shuffleMode: this.shuffleMode,
      repeatMode: this.repeatMode,
      queue: this.queue,
      queueIndex: this.queueIndex,
      isScreenVisible: this.isScreenVisible
    };
  }
}

export const audioEngine = new AudioEngine();