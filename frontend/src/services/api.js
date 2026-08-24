// AuraSound 100% OFFLINE - plus de serveur, uniquement MediaStore natif + localStorage
export const api = {
  // Playlists 100% locales (plus de sync serveur)
  readLocalPlaylists() {
    try { return JSON.parse(localStorage.getItem('aurasound_local_playlists') || '[]'); } catch (e) { return []; }
  },
  writeLocalPlaylists(list) { localStorage.setItem('aurasound_local_playlists', JSON.stringify(list)); },

  async getPlaylists() {
    return { success: true, playlists: this.readLocalPlaylists().map(p => ({ ...p, track_count: p.tracks ? p.tracks.length : 0, total_duration: 0 })) };
  },
  async createPlaylist(data) {
    const locals = this.readLocalPlaylists();
    const newPl = { id: 'pl_' + Date.now(), name: data.name, description: data.description || '', cover_url: null, tracks: [], created_at: Date.now() };
    locals.push(newPl);
    this.writeLocalPlaylists(locals);
    return { success: true, playlist: newPl };
  },
  async getPlaylist(id) {
    const local = this.readLocalPlaylists().find(p => p.id === id);
    if (local) return { success: true, playlist: local, tracks: local.tracks || [] };
    return { success: false, error: 'Playlist introuvable' };
  },
  async addTrackToPlaylist(playlistId, track_id) {
    const locals = this.readLocalPlaylists();
    const pl = locals.find(p => p.id === playlistId);
    if (pl && !(pl.tracks || []).some(t => t.id === track_id)) {
      pl.tracks = pl.tracks || [];
      // store minimal track ref; full track resolved at read time
      pl.tracks.push({ id: track_id });
      this.writeLocalPlaylists(locals);
    }
    return { success: true };
  },
  async removeTrackFromPlaylist(playlistId, trackId) {
    const locals = this.readLocalPlaylists();
    const pl = locals.find(p => p.id === playlistId);
    if (pl) { pl.tracks = (pl.tracks || []).filter(t => t.id !== trackId); this.writeLocalPlaylists(locals); }
    return { success: true };
  },
  async deletePlaylist(id) {
    this.writeLocalPlaylists(this.readLocalPlaylists().filter(p => p.id !== id));
    return { success: true };
  },

  // Telemetrie 100% locale (plus d'envoi serveur)
  async recordTelemetry(data) {
    try {
      const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
      sessions.push({ ...data, timestamp: Date.now() });
      localStorage.setItem('aurasound_sessions', JSON.stringify(sessions.slice(-800)));
      // Compteur d'écoutes par morceau (pour le badge 🔥 de la bibliothèque)
      const counts = this.readPlayCounts();
      counts[data.id_morceau] = (counts[data.id_morceau] || 0) + 1;
      localStorage.setItem('aurasound_play_counts', JSON.stringify(counts));
    } catch (e) {}
    return { success: true };
  },

  readPlayCounts() { try { return JSON.parse(localStorage.getItem('aurasound_play_counts') || '{}'); } catch (e) { return {}; } },

  async getTelemetryStats() {
    const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
    const tracks = this.getCachedTracks();
    const trackById = {};
    tracks.forEach(t => { trackById[t.id] = t; });

    const total_sessions = sessions.length;
    const total_seconds_listened = sessions.reduce((acc, s) => acc + (s.duree_ecoutee || 0), 0);
    const total_completed = sessions.filter(s => !s.skippe).length;
    const total_skipped = sessions.filter(s => s.skippe).length;
    const completion_rate_pct = total_sessions > 0 ? (total_completed / total_sessions) * 100 : 0;
    const skip_rate_pct = total_sessions > 0 ? (total_skipped / total_sessions) * 100 : 0;

    // Top morceaux : agrégation par id_morceau
    const byTrack = {};
    sessions.forEach(s => {
      const id = s.id_morceau;
      if (!id) return;
      if (!byTrack[id]) byTrack[id] = { id, title: trackById[id]?.title || id, artist: trackById[id]?.artist || 'Artiste inconnu', total_listened_sec: 0, sessions_count: 0, completed_count: 0 };
      byTrack[id].total_listened_sec += (s.duree_ecoutee || 0);
      byTrack[id].sessions_count += 1;
      if (!s.skippe) byTrack[id].completed_count += 1;
    });
    const top_tracks = Object.values(byTrack).sort((a,b)=>b.total_listened_sec-a.total_listened_sec);

    // Top artistes
    const byArtist = {};
    top_tracks.forEach(t => {
      const a = t.artist || 'Artiste inconnu';
      if (!byArtist[a]) byArtist[a] = { artist: a, total_listened_sec: 0, sessions_count: 0 };
      byArtist[a].total_listened_sec += t.total_listened_sec;
      byArtist[a].sessions_count += t.sessions_count;
    });
    const top_artists = Object.values(byArtist).sort((a,b)=>b.total_listened_sec-a.total_listened_sec);

    // Dernières sessions (les plus récentes en premier)
    const recent_sessions = [...sessions].reverse().map(s => ({
      ...s,
      title: trackById[s.id_morceau]?.title || s.title || s.id_morceau,
      artist: trackById[s.id_morceau]?.artist || s.artist || '—',
      pourcentage_ecoute: s.pourcentage_ecoute ?? s.progression ?? 0
    }));

    // Répartition horaire (00h → 23h) sur les 7 derniers jours
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const hourly_distribution = Array.from({ length: 24 }, (_, h) => ({ hour: h.toString().padStart(2,'0'), count: 0 }));
    sessions.forEach(s => {
      if (!s.timestamp || s.timestamp < weekAgo) return;
      const h = new Date(s.timestamp).getHours();
      hourly_distribution[h].count += 1;
    });

    return { success: true, stats: { total_sessions, total_seconds_listened, total_completed, total_skipped, completion_rate_pct, skip_rate_pct, top_tracks, top_artists, recent_sessions, hourly_distribution } };
  },

  // Export 100% local : génère le contenu et déclenche un téléchargement
  buildTelemetryExport(format = 'csv') {
    const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
    const tracks = this.getCachedTracks();
    const trackById = {}; tracks.forEach(t => trackById[t.id] = t);
    if (format === 'json') {
      const data = sessions.map(s => ({ ...s, title: trackById[s.id_morceau]?.title || null, artist: trackById[s.id_morceau]?.artist || null }));
      return JSON.stringify({ exported_at: new Date().toISOString(), app: 'AuraSound v3.2', sessions: data }, null, 2);
    }
    // CSV
    const esc = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const rows = [['timestamp','titre','artiste','duree_totale_s','duree_ecoutee_s','progression_pct','statut']];
    sessions.forEach(s => rows.push([
      new Date(s.timestamp||Date.now()).toISOString(),
      trackById[s.id_morceau]?.title || s.id_morceau || '',
      trackById[s.id_morceau]?.artist || '',
      s.duree_totale || '', s.duree_ecoutee || '',
      s.progression ?? s.pourcentage_ecoute ?? '',
      s.skippe ? 'skippe' : 'complet'
    ]));
    return '\uFEFF' + rows.map(r => r.map(esc).join(';')).join('\n');
  },
  downloadTelemetryExport(format = 'csv') {
    try {
      const content = this.buildTelemetryExport(format);
      const mime = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aurasound_stats_${new Date().toISOString().slice(0,10)}.${format}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
      return true;
    } catch(e){ console.warn('export failed', e); return false; }
  },

  // Favoris locaux Map { trackId: true }
  readFavOverrides() { try { return JSON.parse(localStorage.getItem('aurasound_fav_overrides') || '{}'); } catch (e) { return {}; } },
  writeFavOverrides(map) { localStorage.setItem('aurasound_fav_overrides', JSON.stringify(map)); },
  setFavOverride(trackId, isFavorite) { const map = this.readFavOverrides(); if (isFavorite) map[trackId] = true; else delete map[trackId]; this.writeFavOverrides(map); },
  clearFavOverride(trackId) { const map = this.readFavOverrides(); delete map[trackId]; this.writeFavOverrides(map); },
  applyFavOverrides(tracks) {
    const favs = this.readFavOverrides();
    const counts = this.readPlayCounts();
    if (!Array.isArray(tracks)) return [];
    return tracks.map(t => {
      let out = favs[t.id] ? { ...t, is_favorite: 1 } : t;
      if (counts[t.id]) out = { ...out, play_count: counts[t.id] };
      return out;
    });
  },

  // Scan natif 100% offline – tourne en fond, persiste pour prochaine ouverture
  async scanDeviceAudio() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
        const res = await window.Capacitor.Plugins.MediaStoreAudio.scanLocalAudio();
        if (res && res.success && res.tracks) {
          localStorage.setItem('aurasound_cached_device_tracks', JSON.stringify(res.tracks));
          localStorage.setItem('aurasound_cached_device_ts', Date.now().toString());
          return this.applyFavOverrides(res.tracks);
        }
      }
    } catch (e) { console.warn('Scan MediaStore non disponible:', e); }
    const cached = localStorage.getItem('aurasound_cached_device_tracks');
    return cached ? this.applyFavOverrides(JSON.parse(cached)) : [];
  },

  // Retourne uniquement le cache sans déclencher de scan (ouverture ultra-rapide)
  getCachedTracks() {
    const cached = localStorage.getItem('aurasound_cached_device_tracks');
    if (!cached) return [];
    try { return this.applyFavOverrides(JSON.parse(cached)); } catch(e){ return []; }
  },

  // Compat : ancien code appelait getTracks() serveur – maintenant alias offline
  async getTracks() {
    const tracks = await this.scanDeviceAudio();
    return { success: true, tracks };
  },
  async getTrack(id) { const all = this.getCachedTracks(); return { success: true, track: all.find(t=>t.id===id) || null }; },
  async deleteTrack(id) {
    // Suppression logique locale uniquement (ne supprime pas fichier système pour sécurité)
    const cached = this.getCachedTracks().filter(t=>t.id!==id);
    localStorage.setItem('aurasound_cached_device_tracks', JSON.stringify(cached));
    // retirer des playlists
    const pls = this.readLocalPlaylists(); pls.forEach(pl=>{ pl.tracks = (pl.tracks||[]).filter(t=>t.id!==id); }); this.writeLocalPlaylists(pls);
    this.clearFavOverride(id);
    return { success: true };
  },
  async updateTrack(id, data) {
    // Favoris uniquement supporté offline
    if (data && typeof data.is_favorite !== 'undefined') this.setFavOverride(id, !!data.is_favorite);
    return { success: true, track: { id, ...data } };
  },
  async uploadTrack() { return { success: false, error: 'Mode offline : import via MediaStore uniquement' }; },

  // Helpers media – offline, plus de baseUrl serveur
  resolveMediaUrl(path) {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('content://') || path.startsWith('blob:')) return path;
    return path;
  },
  resolveAudioUrl(track) {
    if (!track) return '';
    if (track.source === 'device_storage' && track.file_path) {
      // ExoPlayer natif attend file_path brut ; pour WebAudio fallback on convertit
      if (track.useNative && track.file_path) return track.file_path;
      if (window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
        try { return window.Capacitor.convertFileSrc(track.file_path); } catch(e){ return track.file_path; }
      }
      return track.file_path;
    }
    return track.file_path || '';
  },

  // Notification native déléguée au ForegroundService
  async updateNativeNotification({ title, artist, album, isPlaying, filePath }) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try {
        await window.Capacitor.Plugins.MediaStoreAudio.updateNotification({ title: title || 'AuraSound', artist: artist || 'Artiste inconnu', album: album || 'AuraSound HD', filePath: filePath || null, isPlaying: !!isPlaying });
      } catch (e) { console.warn('Native notification:', e); }
    }
  },
  // ExoPlayer natif Hi-Res – privilégie content:// (pas d'exception Scoped Storage)
  async nativePlay(track) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try {
        const payload = {
          filePath: track.file_path || null,
          contentUri: track.content_uri || null,
          title: track.title, artist: track.artist, album: track.album
        };
        const res = await window.Capacitor.Plugins.MediaStoreAudio.playNative(payload);
        return (res && res.success !== false) ? res : { success: false };
      } catch(e){ console.warn('nativePlay', e); }
    }
    return { success: false };
  },
  async nativePause() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try { await window.Capacitor.Plugins.MediaStoreAudio.pauseNative(); } catch(e){}
    }
  },
  async nativeSeek(posSec) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStoreAudio) {
      try { await window.Capacitor.Plugins.MediaStoreAudio.seekNative({ position: posSec }); } catch(e){}
    }
  }
};

// Compat no-op pour ancien WebSocket
export function createWebSocket() { return { close(){} }; }
export const getBaseUrl = () => '';
export const getServerUrl = () => null;
export const setServerUrl = () => {};
export const probeBackendServers = async () => null;
