// Connexion au serveur : URL personnalisee (Parametres) + fallback localhost
const SERVER_URL_KEY = 'aurasound_server_url';
const DEFAULT_SERVER_URLS = ['http://localhost:5000'];

let activeBaseUrl = null;

export const getServerUrl = () => localStorage.getItem(SERVER_URL_KEY);

export const setServerUrl = (url) => {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (clean) {
    localStorage.setItem(SERVER_URL_KEY, clean);
  } else {
    localStorage.removeItem(SERVER_URL_KEY);
  }
  activeBaseUrl = clean || null;
};

const getCandidates = () => {
  const custom = getServerUrl();
  const all = custom ? [custom, ...DEFAULT_SERVER_URLS] : [...DEFAULT_SERVER_URLS];
  return [...new Set(all)];
};

// Auto-decouverte du serveur (sonde /api/health sur les candidats)
export const probeBackendServers = async () => {
  for (const url of getCandidates()) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        activeBaseUrl = url;
        return url;
      }
    } catch (e) {}
  }
  return activeBaseUrl;
};

if (typeof window !== 'undefined') {
  probeBackendServers();
}

export const getBaseUrl = () => {
  const custom = getServerUrl();
  if (custom) return custom.replace(/\/$/, '');
  return activeBaseUrl || DEFAULT_SERVER_URLS[0];
};

export const api = {
  // Morceaux
  async getTracks({ search = '', sortBy = 'date_added', sortOrder = 'DESC', filter = 'all' } = {}) {
    const params = new URLSearchParams({ search, sortBy, sortOrder, filter });
    const res = await fetch(`${getBaseUrl()}/api/tracks?${params.toString()}`);
    return res.json();
  },

  async getTrack(id) {
    const res = await fetch(`${getBaseUrl()}/api/tracks/${id}`);
    return res.json();
  },

  async deleteTrack(id) {
    const res = await fetch(`${getBaseUrl()}/api/tracks/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async updateTrack(id, data) {
    const res = await fetch(`${getBaseUrl()}/api/tracks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async uploadTrack(formData) {
    const res = await fetch(`${getBaseUrl()}/api/tracks/upload`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  // Playlists
  readLocalPlaylists() {
    try {
      return JSON.parse(localStorage.getItem('aurasound_local_playlists') || '[]');
    } catch (e) {
      return [];
    }
  },

  writeLocalPlaylists(list) {
    localStorage.setItem('aurasound_local_playlists', JSON.stringify(list));
  },

  async getPlaylists() {
    let serverPlaylists = null;
    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists`);
      const data = await res.json();
      if (data && data.success) serverPlaylists = data.playlists;
    } catch (e) {}

    if (serverPlaylists) {
      // Serveur joignable : synchroniser les playlists creees hors-ligne
      await this.flushLocalPlaylists();
      serverPlaylists.push(...this.readLocalPlaylists().map(p => ({
        ...p,
        track_count: p.tracks ? p.tracks.length : 0,
        total_duration: 0
      })));
      return { success: true, playlists: serverPlaylists };
    }

    // Hors-ligne : playlists locales uniquement
    return { success: true, playlists: this.readLocalPlaylists() };
  },

  // Pousse vers le serveur les playlists creees hors-ligne (+ leurs morceaux)
  async flushLocalPlaylists() {
    const locals = this.readLocalPlaylists();
    if (locals.length === 0) return;

    const remaining = [];
    for (const pl of locals) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/playlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: pl.name, description: pl.description })
        });
        const data = await res.json();
        if (!data || !data.success || !data.playlist) throw new Error('creation impossible');

        for (const t of (pl.tracks || [])) {
          await this.addTrackToPlaylist(data.playlist.id, t.id);
        }
      } catch (e) {
        remaining.push(pl);
      }
    }
    this.writeLocalPlaylists(remaining);
  },

  async createPlaylist(data) {
    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      const locals = this.readLocalPlaylists();
      const newPl = {
        id: 'pl_' + Date.now(),
        name: data.name,
        description: data.description,
        cover_url: null,
        tracks: []
      };
      locals.push(newPl);
      this.writeLocalPlaylists(locals);
      return { success: true, playlist: newPl };
    }
  },

  async getPlaylist(id) {
    if (id.startsWith('pl_')) {
      const local = this.readLocalPlaylists().find(p => p.id === id);
      if (local) return { success: true, playlist: local, tracks: local.tracks || [] };
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists/${id}`);
      return await res.json();
    } catch (e) {
      return { success: true, playlist: { id, name: 'Playlist', tracks: [] }, tracks: [] };
    }
  },

  async addTrackToPlaylist(playlistId, track_id) {
    if (playlistId.startsWith('pl_')) {
      const locals = this.readLocalPlaylists();
      const pl = locals.find(p => p.id === playlistId);
      if (pl && !(pl.tracks || []).some(t => t.id === track_id)) {
        pl.tracks = pl.tracks || [];
        pl.tracks.push({ id: track_id });
        this.writeLocalPlaylists(locals);
      }
      return { success: true };
    }

    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    if (playlistId.startsWith('pl_')) {
      const locals = this.readLocalPlaylists();
      const pl = locals.find(p => p.id === playlistId);
      if (pl) {
        pl.tracks = (pl.tracks || []).filter(t => t.id !== trackId);
        this.writeLocalPlaylists(locals);
      }
      return { success: true };
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE'
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  },

  async deletePlaylist(id) {
    if (id.startsWith('pl_')) {
      this.writeLocalPlaylists(this.readLocalPlaylists().filter(p => p.id !== id));
      return { success: true };
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/playlists/${id}`, { method: 'DELETE' });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  },

  // Telemetrie & Stats
  async recordTelemetry(data) {
    try {
      fetch(`${getBaseUrl()}/api/telemetry/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    } catch (e) {}

    try {
      const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
      sessions.push({ ...data, timestamp: Date.now() });
      localStorage.setItem('aurasound_sessions', JSON.stringify(sessions.slice(-500)));
    } catch (e) {}
    return { success: true };
  },

  async getTelemetryStats() {
    try {
      const res = await fetch(`${getBaseUrl()}/api/telemetry/stats`);
      const data = await res.json();
      if (data && data.success) return data;
    } catch (e) {}

    // Calcul autonome local sur le telephone
    const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
    const total_sessions = sessions.length;
    const total_seconds_listened = sessions.reduce((acc, s) => acc + (s.duree_ecoutee || 0), 0);
    const total_completed = sessions.filter(s => !s.skippe).length;
    const total_skipped = sessions.filter(s => s.skippe).length;
    const completion_rate_pct = total_sessions > 0 ? (total_completed / total_sessions) * 100 : 0;
    const skip_rate_pct = total_sessions > 0 ? (total_skipped / total_sessions) * 100 : 0;

    return {
      success: true,
      stats: {
        total_sessions,
        total_seconds_listened,
        total_completed,
        total_skipped,
        completion_rate_pct,
        skip_rate_pct,
        top_tracks: [],
        hourly_distribution: []
      }
    };
  },

  getExportUrl(format = 'csv') {
    return `${getBaseUrl()}/api/telemetry/export?format=${format}`;
  },

  // Systeme
  async getSystemInfo() {
    const res = await fetch(`${getBaseUrl()}/api/system/info`);
    return res.json();
  },

  // Favoris enregistres localement (pistes du telephone + mode hors-ligne)
  // Map { trackId: true } persistee, re-appliquee a chaque chargement
  readFavOverrides() {
    try {
      return JSON.parse(localStorage.getItem('aurasound_fav_overrides') || '{}');
    } catch (e) {
      return {};
    }
  },

  writeFavOverrides(map) {
    localStorage.setItem('aurasound_fav_overrides', JSON.stringify(map));
  },

  setFavOverride(trackId, isFavorite) {
    const map = this.readFavOverrides();
    if (isFavorite) {
      map[trackId] = true;
    } else {
      delete map[trackId];
    }
    this.writeFavOverrides(map);
  },

  clearFavOverride(trackId) {
    const map = this.readFavOverrides();
    delete map[trackId];
    this.writeFavOverrides(map);
  },

  applyFavOverrides(tracks) {
    const favs = this.readFavOverrides();
    if (!Array.isArray(tracks)) return [];
    return tracks.map(t => favs[t.id] ? { ...t, is_favorite: 1 } : t);
  },

  // Scan automatique des musiques locales du telephone via plugin natif
  async scanDeviceAudio() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
        const res = await window.Capacitor.Plugins.MediaStoreAudio.scanLocalAudio();
        if (res && res.success && res.tracks) {
          localStorage.setItem('aurasound_cached_device_tracks', JSON.stringify(res.tracks));
          return this.applyFavOverrides(res.tracks);
        }
      }
    } catch (e) {
      console.warn('Scan MediaStore non disponible:', e);
    }
    const cached = localStorage.getItem('aurasound_cached_device_tracks');
    return cached ? this.applyFavOverrides(JSON.parse(cached)) : [];
  },

  // Helper pour resoudre URL d'un fichier audio ou pochette
  resolveMediaUrl(path) {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('content://') || path.startsWith('blob:')) return path;
    const base = getBaseUrl();
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  },

  resolveAudioUrl(track) {
    if (!track) return '';
    // Morceaux natifs du stockage du telephone
    if (track.source === 'device_storage' && track.file_path) {
      if (window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
        return window.Capacitor.convertFileSrc(track.file_path);
      }
      return track.file_path;
    }

    if (!track.file_path) return '';
    const filename = track.file_path.split(/[\\\/]/).pop();
    const base = getBaseUrl();
    return `${base}/music/${encodeURIComponent(filename)}`;
  },

  async updateNativeNotification({ title, artist, album, isPlaying, filePath }) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try {
        await window.Capacitor.Plugins.MediaStoreAudio.updateNotification({
          title: title || 'AuraSound',
          artist: artist || 'Artiste inconnu',
          album: album || 'AuraSound HD',
          filePath: filePath || null,
          isPlaying: !!isPlaying
        });
      } catch (e) {
        console.warn('Native notification update:', e);
      }
    }
  }
};

// WebSocket Manager avec backoff exponentiel (max 6 tentatives)
export function createWebSocket(onMessage) {
  let ws = null;
  let reconnectTimeout = null;
  let attempts = 0;
  let closedByUser = false;

  const connect = () => {
    if (closedByUser) return;
    try {
      const base = getBaseUrl();
      const wsUrl = base.replace(/^http/, 'ws');
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        attempts = 0;
        console.log('AuraSound WebSocket connecte:', wsUrl);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onMessage) onMessage(data);
        } catch (e) {
          console.error('Erreur parsing WS message:', e);
        }
      };
      ws.onclose = () => {
        if (closedByUser) return;
        if (attempts >= 6) {
          console.warn('WebSocket: serveur injoignable apres 6 tentatives, abandon de la reconnexion.');
          return;
        }
        const delay = Math.min(30000, 2000 * Math.pow(2, attempts));
        attempts += 1;
        reconnectTimeout = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      };
    } catch (e) {
      console.error('Erreur creation WS:', e);
    }
  };

  connect();

  return {
    close() {
      closedByUser = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    }
  };
}
