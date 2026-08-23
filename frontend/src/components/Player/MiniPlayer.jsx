import React from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import { Play, Pause, SkipForward, Music2 } from 'lucide-react';

export default function MiniPlayer({ theme, track, isPlaying, currentTime, duration, onExpand }) {
  if (!track) return null;

  const thumb = track.thumbnail_path ? api.resolveMediaUrl(track.thumbnail_path) : null;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      onClick={onExpand}
      className="fixed bottom-20 left-3 right-3 sm:left-6 sm:right-6 max-w-xl mx-auto z-40 rounded-2xl glass-card border p-2.5 shadow-2xl flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] overflow-hidden"
      style={{
        borderColor: theme.border,
        boxShadow: `0 10px 30px rgba(0,0,0,0.8), 0 0 20px ${theme.glow}`
      }}
    >
      {/* Top Edge Mini Progress Line */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/10">
        <div 
          className="h-full transition-all duration-200"
          style={{ 
            width: `${progressPct}%`,
            backgroundColor: theme.accent,
            boxShadow: `0 0 10px ${theme.accent}`
          }}
        />
      </div>

      {/* Left: Thumbnail & Info */}
      <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
        <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 shadow-md">
          {thumb ? (
            <img 
              src={thumb} 
              alt={track.title} 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
              className="w-full h-full object-cover" 
            />
          ) : null}
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-400 absolute inset-0 -z-10">
            <Music2 size={18} style={{ color: theme.accent }} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-xs sm:text-sm font-bold text-white truncate">{track.title}</h4>
          <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
        </div>
      </div>

      {/* Right: Play/Pause & Next Buttons */}
      <div className="flex items-center space-x-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => audioEngine.togglePlayPause()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-black shadow-lg transition hover:scale-105 active:scale-95"
          style={{
            backgroundColor: theme.accent,
            boxShadow: `0 0 15px ${theme.glow}`
          }}
        >
          {isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <button
          onClick={() => audioEngine.nextTrack()}
          className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition"
        >
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
