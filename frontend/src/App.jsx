import React, { useState, useEffect } from 'react';
import { THEMES } from './services/themes';
import { api } from './services/api';
import { audioEngine } from './services/audioEngine';

import Navbar from './components/Navbar';
import Library from './components/Library/Library';
import Analytics from './components/Analytics/Analytics';
import Playlists from './components/Playlists/Playlists';
import Settings from './components/Settings/Settings';
import Player from './components/Player/Player';
import MiniPlayer from './components/Player/MiniPlayer';
import EqualizerModal from './components/Equalizer/Equalizer';
import FloatingWidget from './components/Widget/FloatingWidget';
import { LayoutGrid } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aurasound_theme');
    return (saved && THEMES[saved]) ? THEMES[saved] : THEMES.obsidian;
  });

  const [activeTab, setActiveTab] = useState('library');
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showFloatingWidget, setShowFloatingWidget] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  
  const [playerState, setPlayerState] = useState(audioEngine.getState());
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [isEQOpen, setIsEQOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => setPlayerState({ ...state }));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleBackAction = () => {
      if (isEQOpen) { setIsEQOpen(false); return true; }
      if (isPlayerFullscreen) { setIsPlayerFullscreen(false); return true; }
      if (showFloatingWidget) { setShowFloatingWidget(false); return true; }
      if (activeTab !== 'library') { setActiveTab('library'); return true; }
      return false;
    };
    window.__onAuraBackPressed = handleBackAction;
    const onBackButton = (e) => { if (handleBackAction()) e?.preventDefault?.(); };
    document.addEventListener('backbutton', onBackButton);
    return () => { window.__onAuraBackPressed = null; document.removeEventListener('backbutton', onBackButton); };
  }, [isEQOpen, isPlayerFullscreen, showFloatingWidget, activeTab]);

  // 100% OFFLINE : cache instantané + scan MediaStore en arrière-plan
  const loadTracks = async ({ backgroundRefresh = false } = {}) => {
    const cachedRaw = localStorage.getItem('aurasound_cached_device_tracks');
    const cachedTs = parseInt(localStorage.getItem('aurasound_cached_device_ts') || '0', 10);

    // Ouverture ultra-rapide depuis cache
    if (cachedRaw && !backgroundRefresh) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached) && cached.length > 0) {
          setTracks(api.applyFavOverrides(cached));
          if (Date.now() - cachedTs < 5*60*1000) {
            setTimeout(() => loadTracks({ backgroundRefresh: true }), 600);
            return;
          }
        }
      } catch(e){}
    }

    // Scan natif ( MediaStore ) – si backgroundRefresh on garde cache et refresh silencieux
    if (backgroundRefresh && cachedRaw) {
      api.scanDeviceAudio().then(fresh => {
        if (fresh && Array.isArray(fresh)) {
          const withFavs = api.applyFavOverrides(fresh);
          setTracks(withFavs);
        }
      }).catch(()=>{});
      // afficher cache immédiatement
      try { const c = JSON.parse(cachedRaw); setTracks(api.applyFavOverrides(c)); } catch(e){}
      return;
    }

    const fresh = await api.scanDeviceAudio();
    setTracks(api.applyFavOverrides(fresh));
  };

  const loadPlaylists = async () => {
    try { const res = await api.getPlaylists(); if (res.success) setPlaylists(res.playlists); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadTracks();
    loadPlaylists();
    const onPerms = () => setTimeout(() => loadTracks({ backgroundRefresh: true }), 400);
    window.addEventListener('aurasound_permissions_granted', onPerms);
    const onVis = () => { if (!document.hidden) loadTracks({ backgroundRefresh: true }); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('aurasound_permissions_granted', onPerms); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const handleSelectTheme = (newTheme) => { setTheme(newTheme); localStorage.setItem('aurasound_theme', newTheme.id); };

  const handleToggleFavorite = async (track) => {
    if (!track) return;
    const newValue = track.is_favorite ? 0 : 1;
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, is_favorite: newValue } : t));
    audioEngine.updateCurrentTrack({ is_favorite: newValue });
    api.setFavOverride(track.id, newValue === 1);
  };

  return (
    <div className="min-h-screen text-white flex flex-col justify-between overflow-x-hidden selection:bg-white selection:text-black"
      style={{ backgroundColor: theme.bg, fontFamily: "'Inter','Geist',system-ui,sans-serif" }}>
      {showSplash && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#040507] pointer-events-none">
          <div className="relative flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="absolute -inset-6 rounded-full blur-2xl opacity-30" style={{ background: theme.accent }} />
              <img src="/logo.svg" alt="AuraSound" className="w-[64px] h-[64px] relative z-10" />
            </div>
            <div className="text-center space-y-1 z-10">
              <h1 className="text-[22px] font-[900] tracking-[0.32em] text-white">AURA<span style={{ color: theme.accent }}>SOUND</span></h1>
              <p className="text-[9px] font-medium tracking-[0.42em] text-zinc-500 uppercase">Noir Mat · Hi-Res</p>
            </div>
          </div>
        </div>
      )}

      <header className="px-5 py-[14px] flex items-center justify-between border-b border-white/[0.06] sticky top-0 z-30" style={{ background: 'rgba(6,7,9,0.84)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
            <img src="/logo.svg" alt="AuraSound" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-[14px] font-[800] tracking-[0.18em] text-white leading-none">AURA<span style={{ color: theme.accent }}>SOUND</span></h1>
            <span className="text-[9px] font-semibold tracking-[0.22em] text-zinc-500 uppercase">Noir Mat Hi-Res</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {playerState.currentTrack && (
            <button onClick={() => setShowFloatingWidget(prev => !prev)}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${showFloatingWidget ? 'bg-white text-black border-white' : 'bg-white/[0.06] text-zinc-400 border-white/10 hover:text-white'}`}>
              <LayoutGrid size={16} />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">
        {activeTab === 'library' && (
          <Library theme={theme} tracks={tracks} onRefresh={loadTracks} currentTrack={playerState.currentTrack} isPlaying={playerState.isPlaying} playlists={playlists} onToggleFavorite={handleToggleFavorite} />
        )}
        {activeTab === 'playlists' && (
          <Playlists theme={theme} onRefreshPlaylists={loadPlaylists} tracks={tracks} onToggleFavorite={handleToggleFavorite} />
        )}
        {activeTab === 'analytics' && (<Analytics theme={theme} />)}
        {activeTab === 'settings' && (
          <Settings currentTheme={theme} onSelectTheme={handleSelectTheme} theme={theme} onRefreshTracks={loadTracks} />
        )}
      </main>

      {showFloatingWidget && playerState.currentTrack && !isPlayerFullscreen && (
        <FloatingWidget theme={theme} track={playerState.currentTrack} isPlaying={playerState.isPlaying} onToggleFavorite={handleToggleFavorite} onClose={() => setShowFloatingWidget(false)} />
      )}
      {playerState.currentTrack && !isPlayerFullscreen && !showFloatingWidget && (
        <MiniPlayer theme={theme} track={playerState.currentTrack} isPlaying={playerState.isPlaying} currentTime={playerState.currentTime} duration={playerState.duration} onExpand={() => setIsPlayerFullscreen(true)} />
      )}
      {isPlayerFullscreen && playerState.currentTrack && (
        <Player theme={theme} track={playerState.currentTrack} isPlaying={playerState.isPlaying} currentTime={playerState.currentTime} duration={playerState.duration} shuffleMode={playerState.shuffleMode} repeatMode={playerState.repeatMode} onClose={() => setIsPlayerFullscreen(false)} onOpenEQ={() => setIsEQOpen(true)} onToggleFavorite={handleToggleFavorite} />
      )}
      <EqualizerModal isOpen={isEQOpen} onClose={() => setIsEQOpen(false)} theme={theme} />
      <Navbar activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: 'smooth' }); }} theme={theme} />
    </div>
  );
}
