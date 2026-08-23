import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import { ListMusic, Plus, Play, Trash2, X, Heart, FolderPlus } from 'lucide-react';

export default function Playlists({ theme, onRefreshPlaylists, tracks = [], onToggleFavorite }) {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null); // Full playlist with tracks
  const [isCreating, setIsCreating] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const [newPlDesc, setNewPlDesc] = useState('');

  const favoriteTracks = tracks.filter(t => t.is_favorite === 1);

  const fetchPlaylists = async () => {
    try {
      const res = await api.getPlaylists();
      if (res.success) {
        setPlaylists(res.playlists);
      }
    } catch (err) {
      console.error('Erreur chargement playlists:', err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    try {
      await api.createPlaylist({ name: newPlName, description: newPlDesc });
      setNewPlName('');
      setNewPlDesc('');
      setIsCreating(false);
      fetchPlaylists();
      if (onRefreshPlaylists) onRefreshPlaylists();
    } catch (err) {
      console.error('Erreur creation playlist:', err);
    }
  };

  const handleOpenPlaylist = async (plId) => {
    if (plId === 'favorites') {
      setActivePlaylist({
        playlist: {
          id: 'favorites',
          name: '❤️ Coups de Cœur (Favoris)',
          description: 'Tous vos morceaux favoris regroupés',
          isSystem: true
        },
        tracks: favoriteTracks
      });
      return;
    }

    try {
      const res = await api.getPlaylist(plId);
      if (res.success) {
        setActivePlaylist(res);
      }
    } catch (err) {
      console.error('Erreur ouverture playlist:', err);
    }
  };

  const handleDeletePlaylist = async (e, plId) => {
    e.stopPropagation();
    if (plId === 'favorites') return;
    if (confirm('Voulez-vous supprimer cette playlist ?')) {
      try {
        await api.deletePlaylist(plId);
        if (activePlaylist && activePlaylist.playlist.id === plId) {
          setActivePlaylist(null);
        }
        fetchPlaylists();
        if (onRefreshPlaylists) onRefreshPlaylists();
      } catch (err) {
        console.error('Erreur suppression playlist:', err);
      }
    }
  };

  const handleRemoveTrack = async (e, trackId) => {
    e.stopPropagation();
    if (!activePlaylist) return;
    if (activePlaylist.playlist.id === 'favorites') {
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        // Meme logique que les coeurs de la bibliotheque (marche hors-ligne)
        if (onToggleFavorite) {
          onToggleFavorite(track);
        } else {
          await api.updateTrack(trackId, { is_favorite: 0 });
        }
        setActivePlaylist(prev => ({
          ...prev,
          tracks: prev.tracks.filter(t => t.id !== trackId)
        }));
      }
      return;
    }
    try {
      await api.removeTrackFromPlaylist(activePlaylist.playlist.id, trackId);
      handleOpenPlaylist(activePlaylist.playlist.id);
      fetchPlaylists();
    } catch (err) {
      console.error('Erreur retrait piste:', err);
    }
  };

  const handlePlayAll = () => {
    if (activePlaylist && activePlaylist.tracks.length > 0) {
      audioEngine.playTrack(activePlaylist.tracks[0], activePlaylist.tracks);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-28 animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold font-heading text-white">Playlists</h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Organisez vos collections musicales
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center space-x-2 text-black transition shadow-lg"
          style={{
            backgroundColor: theme.accent,
            boxShadow: `0 0 15px ${theme.glow}`
          }}
        >
          <Plus size={16} />
          <span>Nouvelle Playlist</span>
        </button>
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl p-6 glass-card border border-white/10 text-white space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Créer une playlist</h3>
              <button onClick={() => setIsCreating(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="Nom de la playlist (ex: Workout, Chill, Nuit...)"
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-2xl bg-black/50 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <textarea
                placeholder="Description optionnelle..."
                value={newPlDesc}
                onChange={(e) => setNewPlDesc(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 rounded-2xl bg-black/50 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-black"
                style={{ backgroundColor: theme.accent }}
              >
                Créer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Playlist Detail View */}
      {activePlaylist ? (
        <div className="glass-card rounded-3xl p-5 border border-white/5 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActivePlaylist(null)}
              className="text-xs font-bold text-zinc-400 hover:text-white transition flex items-center space-x-1"
            >
              <span>← Retour aux playlists</span>
            </button>
            <button
              onClick={handlePlayAll}
              disabled={activePlaylist.tracks.length === 0}
              className="px-4 py-2 rounded-2xl text-xs font-extrabold text-black flex items-center space-x-1.5 shadow-lg disabled:opacity-40"
              style={{ backgroundColor: theme.accent }}
            >
              <Play size={14} fill="currentColor" />
              <span>Tout Lire ({activePlaylist.tracks.length})</span>
            </button>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white">{activePlaylist.playlist.name}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">{activePlaylist.playlist.description}</p>
          </div>

          {/* Tracks in Playlist */}
          {activePlaylist.tracks.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">Cette playlist est vide pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {activePlaylist.tracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => audioEngine.playTrack(track, activePlaylist.tracks)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-black/30 hover:bg-white/5 border border-white/5 cursor-pointer transition"
                >
                  <div className="flex items-center space-x-3 min-w-0 mr-2">
                    <Play size={14} className="text-zinc-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{track.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveTrack(e, track.id)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 transition"
                    title="Retirer de la playlist"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Playlists Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Smart Pinned Favorites Playlist */}
          <div
            onClick={() => handleOpenPlaylist('favorites')}
            className="group glass-card rounded-3xl p-4 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 transition-all cursor-pointer space-y-3 relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-2xl bg-red-500/10 text-red-400">
                <Heart size={22} fill="currentColor" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                Auto
              </span>
            </div>

            <div>
              <h4 className="text-base font-bold text-white truncate">❤️ Coups de Cœur</h4>
              <p className="text-xs text-zinc-400 truncate mt-0.5">Tous vos morceaux favoris</p>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/5">
              <span>{favoriteTracks.length} morceau{favoriteTracks.length > 1 ? 'x' : ''}</span>
              <span className="font-mono text-red-400 font-bold">Favoris</span>
            </div>
          </div>

          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => handleOpenPlaylist(pl.id)}
              className="group glass-card rounded-3xl p-4 border border-white/5 hover:border-white/20 transition-all cursor-pointer space-y-3 relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div 
                  className="p-3 rounded-2xl bg-white/5"
                  style={{ color: theme.accent }}
                >
                  <ListMusic size={22} />
                </div>
                <button
                  onClick={(e) => handleDeletePlaylist(e, pl.id)}
                  className="p-2 rounded-xl text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  title="Supprimer la playlist"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div>
                <h4 className="text-base font-bold text-white truncate">{pl.name}</h4>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{pl.description || 'Playlist personnalisée'}</p>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-white/5">
                <span>{pl.track_count || 0} morceau{pl.track_count > 1 ? 'x' : ''}</span>
                <span className="font-mono">{Math.floor((pl.total_duration || 0) / 60)} min</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}