import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import { Search, Play, Pause, Heart, Trash2, ArrowUpDown, Music2, HeartHandshake } from 'lucide-react';

export default function Library({ theme, tracks = [], onRefresh, currentTrack, isPlaying, playlists = [], onToggleFavorite }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | favorites
  const [sortBy, setSortBy] = useState('date_added');
  const [sortOrder, setSortOrder] = useState('DESC');

  const filteredTracks = useMemo(() => {
    let list = [...tracks];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.artist && t.artist.toLowerCase().includes(q)) || (t.album && t.album.toLowerCase().includes(q)));
    }
    if (filter === 'favorites') list = list.filter(t => t.is_favorite === 1);
    list.sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortOrder === 'ASC' ? -1 : 1;
      if (va > vb) return sortOrder === 'ASC' ? 1 : -1;
      return 0;
    });
    return list;
  }, [tracks, search, filter, sortBy, sortOrder]);

  const handlePlay = (track) => {
    if (currentTrack && currentTrack.id === track.id) audioEngine.togglePlayPause();
    else audioEngine.playTrack(track, filteredTracks);
  };
  const handleToggleFavorite = async (e, track) => { e.stopPropagation(); if (onToggleFavorite) onToggleFavorite(track); };
  const handleDelete = async (e, trackId) => { e.stopPropagation(); if (confirm('Retirer ce morceau de la bibliothèque ?')) { await api.deleteTrack(trackId); if (onRefresh) onRefresh({ backgroundRefresh: true }); } };
  const formatDuration = (sec) => { if (!sec || isNaN(sec)) return '—'; const m = Math.floor(sec/60); const s = Math.floor(sec%60); return `${m}:${String(s).padStart(2,'0')}`; };

  return (
    <div className="w-full max-w-[880px] mx-auto px-4 sm:px-6 pt-6 pb-28 space-y-5">
      {/* Header noir mat */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-[22px] font-[800] tracking-[-0.03em] text-white">Bibliothèque</h2>
          <p className="text-[12px] font-medium tracking-wide text-zinc-500 mt-0.5">{filteredTracks.length} titres · {tracks.filter(t=>t.is_favorite).length} favoris</p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <button onClick={()=>setFilter(filter==='favorites'?'all':'favorites')} className={`h-8 px-3.5 rounded-full text-[11px] font-[700] tracking-wide transition border ${filter==='favorites'?'bg-white text-black border-white':'bg-white/[0.06] text-zinc-400 border-white/10 hover:text-white'}`}>
            <span className="inline-flex items-center gap-1.5"><HeartHandshake size={13}/> Favoris</span>
          </button>
        </div>
      </div>

      {/* Search + Sort – noir mat, une seule ligne épurée */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="text" placeholder="Rechercher titre, artiste, album" value={search} onChange={(e)=>setSearch(e.target.value)}
            className="w-full h-[42px] pl-9 pr-3 rounded-2xl bg-white/[0.06] border border-white/[0.07] text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/15 focus:bg-white/[0.08] transition" />
        </div>
        <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="h-[42px] px-3 rounded-2xl bg-white/[0.06] border border-white/[0.07] text-zinc-200 text-[12px] font-medium focus:outline-none">
          <option value="date_added">Ajout récent</option>
          <option value="title">Titre A-Z</option>
          <option value="artist">Artiste</option>
          <option value="duration">Durée</option>
        </select>
        <button onClick={()=>setSortOrder(p=>p==='ASC'?'DESC':'ASC')} className="w-[42px] h-[42px] rounded-2xl bg-white/[0.06] border border-white/[0.07] text-zinc-400 hover:text-white flex items-center justify-center">
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* Filtre favoris mobile */}
      <div className="sm:hidden flex gap-2">
        <button onClick={()=>setFilter('all')} className={`flex-1 h-8 rounded-full text-[11px] font-bold border ${filter==='all'?'bg-white text-black border-white':'text-zinc-500 border-white/10'}`}>Tous</button>
        <button onClick={()=>setFilter('favorites')} className={`flex-1 h-8 rounded-full text-[11px] font-bold border ${filter==='favorites'?'bg-white text-black border-white':'text-zinc-500 border-white/10'}`}>Favoris · {tracks.filter(t=>t.is_favorite).length}</button>
      </div>

      {filteredTracks.length === 0 ? (
        <div className="rounded-[24px] bg-white/[0.04] border border-white/[0.06] p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mx-auto text-zinc-500"><Music2 size={22}/></div>
          <h3 className="text-[13px] font-bold text-white mt-4">{filter==='favorites'?'Aucun favori':'Aucun titre'}</h3>
          <p className="text-[12px] text-zinc-500 mt-1 max-w-[320px] mx-auto">{filter==='favorites'?'Appuie sur le cœur pour ajouter tes coups de cœur.':'Tes musiques apparaissent ici automatiquement. Aucun scan manuel nécessaire.'}</p>
        </div>
      ) : (
        <div className="space-y-[8px]">
          {filteredTracks.map((track) => {
            const isCurrent = currentTrack && currentTrack.id === track.id;
            return (
              <div key={track.id} onClick={()=>handlePlay(track)}
                className={`group flex items-center gap-3 p-[10px] pr-2 rounded-2xl border cursor-pointer transition ${isCurrent?'bg-white text-black border-white':'bg-white/[0.045] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/10'}`}>
                <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-900">
                  {track.thumbnail_path ? <img src={track.thumbnail_path} alt={track.title} className="w-full h-full object-cover" onError={(e)=>e.currentTarget.style.display='none'} /> : null}
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-black text-zinc-500 -z-10"><Music2 size={16}/></div>
                  <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isCurrent && isPlaying ? <Pause size={15} className="text-white fill-white"/> : <Play size={15} className="text-white fill-white ml-0.5"/>}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={`text-[13px] font-[650] leading-tight truncate ${isCurrent?'text-black':'text-white'}`}>{track.title}</h4>
                  <p className={`text-[11px] truncate ${isCurrent?'text-zinc-600':'text-zinc-500'}`}>{track.artist} · {track.album || 'Single'}</p>
                </div>
                <span className={`text-[11px] font-medium tabular-nums hidden sm:block ${isCurrent?'text-zinc-600':'text-zinc-500'}`}>{formatDuration(track.duration)}</span>
                <button onClick={(e)=>handleToggleFavorite(e,track)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${track.is_favorite ? (isCurrent?'bg-black text-white':'bg-white text-black') : (isCurrent?'text-zinc-500 hover:text-black':'text-zinc-500 hover:text-white')}`}>
                  <Heart size={14} fill={track.is_favorite?'currentColor':'none'} />
                </button>
                <button onClick={(e)=>handleDelete(e,track.id)} className={`w-8 h-8 rounded-xl flex items-center justify-center ${isCurrent?'text-zinc-500 hover:text-black':'text-zinc-600 hover:text-white'}`}><Trash2 size={14}/></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
