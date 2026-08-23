import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import Visualizer from '../Visualizer/Visualizer';
import { 
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, 
  Volume2, VolumeX, Sliders, ChevronDown, Heart, Music2, Sparkles, Disc 
} from 'lucide-react';

export default function Player({ 
  theme, 
  track, 
  isPlaying, 
  currentTime, 
  duration, 
  shuffleMode, 
  repeatMode, 
  onClose,
  onOpenEQ,
  onToggleFavorite
}) {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(currentTime);
    }
  }, [currentTime, isSeeking]);

  if (!track) return null;

  const thumb = track.thumbnail_path ? api.resolveMediaUrl(track.thumbnail_path) : null;

  const handleSeekChange = (e) => {
    setIsSeeking(true);
    setSeekValue(parseFloat(e.target.value));
  };

  const handleSeekCommit = () => {
    setIsSeeking(false);
    audioEngine.seek(seekValue);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    audioEngine.setVolume(val);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      audioEngine.setVolume(volume || 0.8);
    } else {
      setIsMuted(true);
      audioEngine.setVolume(0);
    }
  };

  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 text-white animate-slide-up overflow-hidden">
      {/* Dynamic Blurred Background Artwork */}
      {thumb && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-25 blur-3xl scale-125 pointer-events-none transition-all duration-1000"
          style={{ backgroundImage: `url(${thumb})` }}
        />
      )}

      {/* Header Bar */}
      <div className="relative z-10 flex items-center justify-between p-5 pt-8 safe-pt">
        <button
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white transition backdrop-blur-md"
        >
          <ChevronDown size={22} />
        </button>

        <div className="text-center">
          <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-400 block">En Lecture</span>
          <span className="text-xs font-semibold text-zinc-200 block truncate max-w-[200px]">
            {track.album || 'AuraSound'}
          </span>
        </div>

        <button
          onClick={onOpenEQ}
          className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white transition backdrop-blur-md"
          title="Égaliseur"
        >
          <Sliders size={20} />
        </button>
      </div>

      {/* Center: Vinyl Album Artwork with Animated Glow */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
          {/* Outer Glowing Ring */}
          <div 
            className="absolute inset-0 rounded-full transition-all duration-700"
            style={{
              boxShadow: isPlaying ? `0 0 50px ${theme.glow}` : 'none',
              background: `radial-gradient(circle, ${theme.accent}20 0%, transparent 70%)`
            }}
          />

          {/* Vinyl Disc / Cover Frame */}
          <div className={`relative w-60 h-60 sm:w-72 sm:h-72 rounded-full overflow-hidden border-4 shadow-2xl p-1 bg-zinc-900 ${
            isPlaying ? 'animate-spin-slow' : 'animate-spin-slow animate-spin-paused'
          }`}
          style={{ borderColor: isPlaying ? theme.accent : 'rgba(255,255,255,0.15)' }}
          >
            {thumb ? (
              <img
                src={thumb}
                alt={track.title}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="w-full h-full object-cover rounded-full"
              />
            ) : null}
            <div className="w-full h-full rounded-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-400 absolute inset-0 -z-10">
              <Disc size={80} style={{ color: theme.accent }} />
            </div>
            {/* Center Vinyl Spindle Hole */}
            <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-[#08090d] border-2 border-white/20 flex items-center justify-center shadow-inner">
              <div className="w-3 h-3 rounded-full bg-white/40" />
            </div>
          </div>
        </div>

        {/* Real-time Spectrum Audio Visualizer */}
        <div className="w-full max-w-sm">
          <Visualizer theme={theme} isPlaying={isPlaying} />
        </div>
      </div>

      {/* Bottom Controls Area */}
      <div className="relative z-10 p-6 space-y-4 max-w-md mx-auto w-full pb-10 safe-pb">
        {/* Track Title & Artist */}
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-4">
            <h3 className="text-xl font-extrabold font-heading text-white truncate">{track.title}</h3>
            <p className="text-sm text-zinc-400 truncate mt-0.5">{track.artist}</p>
          </div>
          <button
            onClick={() => onToggleFavorite && onToggleFavorite(track)}
            className={`p-3 rounded-2xl transition ${
              track.is_favorite ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-400 hover:text-white bg-white/5'
            }`}
          >
            <Heart size={22} fill={track.is_favorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Seekbar */}
        <div className="space-y-1.5">
          <input
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={seekValue}
            onChange={handleSeekChange}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20 accent-cyan-400"
            style={{ accentColor: theme.accent }}
          />
          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
            <span>{formatTime(seekValue)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls: Shuffle, Prev, Play/Pause, Next, Repeat */}
        <div className="flex items-center justify-between pt-2">
          {/* Shuffle */}
          <button
            onClick={() => audioEngine.toggleShuffle()}
            className={`p-2.5 rounded-2xl transition ${
              shuffleMode ? 'text-cyan-400 bg-white/10 shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}
            style={{ color: shuffleMode ? theme.accent : undefined }}
          >
            <Shuffle size={20} />
          </button>

          {/* Prev */}
          <button
            onClick={() => audioEngine.prevTrack()}
            className="p-3 rounded-2xl text-zinc-300 hover:text-white hover:bg-white/10 transition"
          >
            <SkipBack size={26} fill="currentColor" />
          </button>

          {/* Glowing Play/Pause */}
          <button
            onClick={() => audioEngine.togglePlayPause()}
            className="w-16 h-16 rounded-full flex items-center justify-center text-black shadow-2xl transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: theme.accent,
              boxShadow: `0 0 30px ${theme.glow}`
            }}
          >
            {isPlaying ? (
              <Pause size={28} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" className="ml-1" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={() => audioEngine.nextTrack()}
            className="p-3 rounded-2xl text-zinc-300 hover:text-white hover:bg-white/10 transition"
          >
            <SkipForward size={26} fill="currentColor" />
          </button>

          {/* Repeat */}
          <button
            onClick={() => audioEngine.cycleRepeat()}
            className={`p-2.5 rounded-2xl transition ${
              repeatMode !== 'off' ? 'text-cyan-400 bg-white/10 shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}
            style={{ color: repeatMode !== 'off' ? theme.accent : undefined }}
          >
            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center space-x-3 pt-2">
          <button onClick={toggleMute} className="text-zinc-400 hover:text-white">
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: theme.accent }}
          />
        </div>
      </div>
    </div>
  );
}
