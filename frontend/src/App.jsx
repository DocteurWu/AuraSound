import React, { useState, useEffect } from 'react';
import { THEMES } from './services/themes';
import { api, createWebSocket } from './services/api';
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
import { LayoutGrid, Sparkles } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('aurasound_theme');
    return (saved && THEMES[saved]) ? THEMES[saved] : THEMES.cyber;
  });

  const [activeTab, setActiveTab] = useState('library');
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showFloatingWidget, setShowFloatingWidget] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  
  // Audio playback state
  const [playerState, setPlayerState] = useState(audioEngine.getState());
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [isEQOpen, setIsEQOpen] = useState(false);

  // Animation de démarrage ultra-rapide
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 550);
    return () => clearTimeout(timer);
  }, []);

  // Synchronisation avec AudioEngine
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => {
      setPlayerState({ ...state });
    });
    return () => unsubscribe();
  }, []);

  // Gestion intelligente du bouton Retour Android (fermeture lecteur, modales, retour bibliothèque)
  useEffect(() => {
    const handleBackAction = () => {
      if (isEQOpen) {
        setIsEQOpen(false);
        return true;
      }
      if (isPlayerFullscreen) {
        setIsPlayerFullscreen(false);
        return true;
      }
      if (showFloatingWidget) {
        setShowFloatingWidget(false);
        return true;
      }
      if (activeTab !== 'library') {
        setActiveTab('library');
        return true;
      }
      return false;
    };

    window.__onAuraBackPressed = handleBackAction;

    const onBackButton = (e) => {
      if (handleBackAction()) {
        e?.preventDefault?.();
      }
    };
    document.addEventListener('backbutton', onBackButton);

    return () => {
      window.__onAuraBackPressed = null;
      document.removeEventListener('backbutton', onBackButton);
    };
  }, [isEQOpen, isPlayerFullscreen, showFloatingWidget, activeTab]);

  const loadTracks = async () => {
    let serverTracks = [];
    try {
      const res = await api.getTracks();
      if (res && res.success && res.tracks) serverTracks = res.tracks;
    } catch (e) {
      console.warn('Backend local non joignable:', e);
    }

    // Détection et scan automatique des musiques locales du téléphone
    let deviceTracks = [];
    try {
      deviceTracks = await api.scanDeviceAudio();
    } catch (e) {
      console.warn('Scan téléphone:', e);
    }

    // Fusion sans doublons
    const combined = [...serverTracks];
    const existingIds = new Set(serverTracks.map(t => t.id));
    deviceTracks.forEach(dt => {
      if (!existingIds.has(dt.id)) {
        combined.push(dt);
      }
    });

    // Applique les favoris enregistres localement (mode hors-ligne)
    setTracks(api.applyFavOverrides(combined));
  };

  const loadPlaylists = async () => {
    try {
      const res = await api.getPlaylists();
      if (res.success) setPlaylists(res.playlists);
    } catch (e) {
      console.error('Erreur chargement playlists:', e);
    }
  };

  useEffect(() => {
    loadTracks();
    loadPlaylists();

    const wsManager = createWebSocket((data) => {
      window.dispatchEvent(new CustomEvent('aura_ws_message', { detail: data }));
      if (data.type === 'TRACK_ADDED' || data.type === 'TRACK_DELETED') {
        loadTracks();
      }
      if (data.type === 'PLAYLIST_CREATED') {
        loadPlaylists();
      }
    });

    return () => wsManager.close();
  }, []);

  const handleSelectTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('aurasound_theme', newTheme.id);
  };

  const handleToggleFavorite = async (track) => {
    if (!track) return;
    const newValue = track.is_favorite ? 0 : 1;

    // Mise a jour optimiste : bibliothèque + lecteur + widget immédiatement
    setTracks(prev => prev.map(t =>
      t.id === track.id ? { ...t, is_favorite: newValue } : t
    ));
    audioEngine.updateCurrentTrack({ is_favorite: newValue });

    // Pistes locales du telephone : persistance locale uniquement
    if (track.source === 'device_storage') {
      api.setFavOverride(track.id, newValue === 1);
      return;
    }

    try {
      const res = await api.updateTrack(track.id, { is_favorite: newValue });
      if (!res || !res.success) throw new Error(res?.error || 'echec');
      api.clearFavOverride(track.id);
    } catch (e) {
      // Serveur injoignable : on garde le like en local, il sera re-synchronise
      console.warn('Serveur injoignable, favori garde en local:', e.message);
      api.setFavOverride(track.id, newValue === 1);
    }
  };

  return (
    <div 
      className="min-h-screen text-white flex flex-col justify-between transition-colors duration-500 overflow-x-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      {/* Animated Futuristic Splash Intro */}
      {showSplash && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#08090d] pointer-events-none transition-opacity duration-300 animate-fade-in"
        >
          <div className="relative flex flex-col items-center space-y-5">
            <div className="relative">
              <div 
                className="absolute -inset-4 rounded-full blur-2xl opacity-60 animate-pulse"
                style={{ backgroundColor: theme.accent }}
              />
              <img 
                src="/logo.svg" 
                alt="AuraSound" 
                className="w-20 h-20 relative z-10 animate-scale-up" 
              />
            </div>
            
            <div className="text-center space-y-1 z-10">
              <h1 className="text-2xl font-black font-heading tracking-widest text-white">
                AURA<span style={{ color: theme.accent }}>SOUND</span>
              </h1>
              <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
                STUDIO PRO HD
              </p>
            </div>

            {/* Neon Soundwave Equalizer Bars */}
            <div className="flex items-center space-x-1.5 pt-1 z-10">
              {[40, 70, 100, 60, 85].map((h, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-bounce"
                  style={{
                    height: `${h * 0.22}px`,
                    backgroundColor: theme.accent,
                    animationDelay: `${i * 100}ms`,
                    boxShadow: `0 0 10px ${theme.glow}`
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Header / Brand Logo & Widget Toggle */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-white/5 bg-black/30 backdrop-blur-lg sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <img src="/logo.svg" alt="AuraSound" className="w-8 h-8" />
          <div>
            <h1 className="text-lg font-black font-heading tracking-wider text-white">
              AURA<span style={{ color: theme.accent }}>SOUND</span>
            </h1>
            <span className="text-[9px] font-mono text-zinc-500 block leading-tight">STUDIO PRO HD</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Toggle Floating Dark Widget Button */}
          {playerState.currentTrack && (
            <button
              onClick={() => setShowFloatingWidget(prev => !prev)}
              className={`p-2 rounded-xl text-xs font-bold border flex items-center space-x-1.5 transition shadow-lg ${
                showFloatingWidget ? 'bg-white/15 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
              }`}
              style={{
                borderColor: showFloatingWidget ? theme.accent : 'rgba(255,255,255,0.1)',
                boxShadow: showFloatingWidget ? `0 0 15px ${theme.glow}` : undefined
              }}
              title="Afficher le Widget Flottant Audio-Réactif"
            >
              <LayoutGrid size={15} style={{ color: theme.accent }} />
              <span className="hidden sm:inline">Widget</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'library' && (
          <Library
            theme={theme}
            tracks={tracks}
            onRefresh={loadTracks}
            currentTrack={playerState.currentTrack}
            isPlaying={playerState.isPlaying}
            playlists={playlists}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'playlists' && (
          <Playlists
            theme={theme}
            onRefreshPlaylists={loadPlaylists}
            tracks={tracks}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {activeTab === 'analytics' && (
          <Analytics theme={theme} />
        )}

        {activeTab === 'settings' && (
          <Settings
            currentTheme={theme}
            onSelectTheme={handleSelectTheme}
            theme={theme}
            onRefreshTracks={loadTracks}
          />
        )}
      </main>

      {/* Floating Audio-Reactive Dark Widget */}
      {showFloatingWidget && playerState.currentTrack && !isPlayerFullscreen && (
        <FloatingWidget
          theme={theme}
          track={playerState.currentTrack}
          isPlaying={playerState.isPlaying}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setShowFloatingWidget(false)}
        />
      )}

      {/* Floating Mini Player */}
      {playerState.currentTrack && !isPlayerFullscreen && !showFloatingWidget && (
        <MiniPlayer
          theme={theme}
          track={playerState.currentTrack}
          isPlaying={playerState.isPlaying}
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          onExpand={() => setIsPlayerFullscreen(true)}
        />
      )}

      {/* Fullscreen Immersive Player */}
      {isPlayerFullscreen && playerState.currentTrack && (
        <Player
          theme={theme}
          track={playerState.currentTrack}
          isPlaying={playerState.isPlaying}
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          shuffleMode={playerState.shuffleMode}
          repeatMode={playerState.repeatMode}
          onClose={() => setIsPlayerFullscreen(false)}
          onOpenEQ={() => setIsEQOpen(true)}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      {/* Equalizer Modal */}
      <EqualizerModal
        isOpen={isEQOpen}
        onClose={() => setIsEQOpen(false)}
        theme={theme}
      />

      {/* Bottom Floating Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        theme={theme}
      />
    </div>
  );
}