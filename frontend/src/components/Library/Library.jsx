import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import { 
  Search, Play, Pause, Heart, Trash2, MoreVertical, Plus, 
  Upload, Filter, ArrowUpDown, Music2, Sparkles, Folder, ListPlus, Radio, Smartphone
} from 'lucide-react';

export default function Library({ 
  theme, 
  tracks = [], 
  onRefresh, 
  currentTrack, 
  isPlaying, 
  onOpenPlaylistsModal,
  playlists = [],
  onToggleFavorite
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'device' | 'favorites' | 'local'
  const [sortBy, setSortBy] = useState('date_added'); // 'date_added' | 'title' | 'artist' | 'duration' | 'play_count'
  const [sortOrder, setSortOrder] = useState('DESC');
  const [activeMenuTrackId, setActiveMenuTrackId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isScanningDevice, setIsScanningDevice] = useState(false);
  const fileInputRef = useRef(null);

  // Filtrage et Tri
  const filteredTracks = useMemo(() => {
    let list = [...tracks];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q))
      );
    }

    // Filter
    if (filter === 'favorites') {
      list = list.filter(t => t.is_favorite === 1);
    } else if (filter === 'device') {
      list = list.filter(t => t.source === 'device_storage');
    } else if (filter === 'local') {
      list = list.filter(t => t.source === 'local_upload');
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
      if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });

    return list;
  }, [tracks, search, filter, sortBy, sortOrder]);

  const handleScanDevice = async () => {
    setIsScanningDevice(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setTimeout(() => setIsScanningDevice(false), 500);
    }
  };

  const handlePlay = (track) => {
    if (currentTrack && currentTrack.id === track.id) {
      audioEngine.togglePlayPause();
    } else {
      audioEngine.playTrack(track, filteredTracks);
    }
  };

  const handleToggleFavorite = async (e, track) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(track);
      return;
    }
    try {
      await api.updateTrack(track.id, { is_favorite: track.is_favorite ? 0 : 1 });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Erreur mise à jour favori:', err);
    }
  };

  const handleDelete = async (e, trackId) => {
    e.stopPropagation();
    if (confirm('Voulez-vous vraiment supprimer ce morceau ?')) {
      try {
        await api.deleteTrack(trackId);
        if (onRefresh) onRefresh();
      } catch (err) {
        console.error('Erreur suppression morceau:', err);
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('audio', file);

    setIsUploading(true);
    try {
      await api.uploadTrack(formData);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Erreur import local:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const formatDuration = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-28 animate-fade-in space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold font-heading text-white">Ma Bibliothèque</h2>
        <p className="text-xs sm:text-sm text-zinc-400">
          {filteredTracks.length} morceau{filteredTracks.length > 1 ? 'x' : ''} disponible{filteredTracks.length > 1 ? 's' : ''}
        </p>
      </div>

      {/* Search Bar & Sort Dropdowns */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Rechercher par titre, artiste, album..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition"
          />
        </div>

        {/* Sort Button / Dropdown */}
        <div className="flex items-center space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3.5 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="date_added">Date d'ajout</option>
            <option value="title">Titre (A-Z)</option>
            <option value="artist">Artiste</option>
            <option value="duration">Durée</option>
            <option value="play_count">Nombre d'écoutes</option>
          </select>
          <button
            onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
            className="p-2.5 rounded-2xl bg-black/40 border border-white/10 text-zinc-300 hover:text-white transition"
            title="Inverser le tri"
          >
            <ArrowUpDown size={15} />
          </button>
        </div>
      </div>



      {/* Tracks List */}
      {filteredTracks.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 text-center space-y-3 border border-white/5">
          <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mx-auto text-zinc-500">
            <Music2 size={32} />
          </div>
          <h3 className="text-base font-bold text-white">Aucun morceau trouvé</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Appuyez sur "Scanner Téléphone" pour détecter vos musiques locales, ou importez des fichiers audio depuis les Paramètres.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTracks.map((track) => {
            const isCurrent = currentTrack && currentTrack.id === track.id;
            const thumb = track.thumbnail_path ? api.resolveMediaUrl(track.thumbnail_path) : null;

            return (
              <div
                key={track.id}
                onClick={() => handlePlay(track)}
                className={`group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-white/10 border-white/20 shadow-xl'
                    : 'glass-card hover:bg-white/5 border-white/5'
                }`}
                style={{
                  borderColor: isCurrent ? theme.border : undefined,
                  boxShadow: isCurrent ? `0 0 20px ${theme.glow}` : undefined
                }}
              >
                {/* Left: Thumbnail & Info */}
                <div className="flex items-center space-x-3.5 min-w-0 flex-1 mr-3">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-900 border border-white/10 shadow-md">
                    {thumb ? (
                      <img 
                        src={thumb} 
                        alt={track.title} 
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                        className="w-full h-full object-cover" 
                      />
                    ) : null}
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-400 absolute inset-0 -z-10">
                      <Music2 size={20} style={{ color: isCurrent ? theme.accent : '#9ca3af' }} />
                    </div>
                    {/* Play/Pause overlay on hover or when current */}
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition ${
                      isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      {isCurrent && isPlaying ? (
                        <Pause size={18} className="text-white fill-white" />
                      ) : (
                        <Play size={18} className="text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className={`text-sm font-bold truncate ${isCurrent ? theme.textColor : 'text-white'}`}>
                      {track.title}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{track.artist}</p>
                    
                    {/* Badges */}
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        track.source === 'device_storage' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-purple-500/20 text-purple-300'
                      }`}>
                        {track.source === 'device_storage' ? '📱 Téléphone' : '📁 Import'}
                      </span>
                      {track.format && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-400 uppercase">
                          {track.format}
                        </span>
                      )}
                      {track.play_count > 0 && (
                        <span className="text-[10px] text-zinc-400">
                          🔥 {track.play_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Duration & Actions */}
                <div className="flex items-center space-x-2.5 flex-shrink-0">
                  <span className="text-xs font-mono text-zinc-400 hidden sm:inline-block">
                    {formatDuration(track.duration)}
                  </span>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => handleToggleFavorite(e, track)}
                    className={`p-2 rounded-xl hover:bg-white/10 transition ${
                      track.is_favorite ? 'text-rose-500' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Heart size={16} fill={track.is_favorite ? 'currentColor' : 'none'} />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, track.id)}
                    title="Supprimer"
                    className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
