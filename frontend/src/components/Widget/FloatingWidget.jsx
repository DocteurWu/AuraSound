import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { audioEngine } from '../../services/audioEngine';
import { 
  Play, Pause, SkipBack, SkipForward, Heart, Minimize2, 
  X, Disc, PictureInPicture2 
} from 'lucide-react';

export default function FloatingWidget({ theme, track, isPlaying, onToggleFavorite, onClose }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  // Audio-reactive visualizer for the widget
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const freqData = audioEngine.getFrequencyData();
      const barCount = 18;
      const barWidth = (width / barCount) - 2;

      for (let i = 0; i < barCount; i++) {
        const val = isPlaying ? (freqData[i * 2] || Math.sin(Date.now() / 150 + i) * 20 + 25) : 3;
        const barHeight = Math.max(2, (val / 255) * height * 0.9);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        const grad = ctx.createLinearGradient(0, height, 0, 0);
        grad.addColorStop(0, `${theme.accent}20`);
        grad.addColorStop(0.6, theme.accent);
        grad.addColorStop(1, '#ffffff');

        ctx.fillStyle = grad;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = isPlaying ? 8 : 1;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [theme, isPlaying]);

  // Support Picture-in-Picture natif pour widget flottant système
  const togglePictureInPicture = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        const stream = canvas.captureStream(30);
        video.srcObject = stream;
        await video.play();
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP non supporté sur ce navigateur:', err.message);
    }
  };

  if (!track) return null;

  const thumb = track.thumbnail_path ? api.resolveMediaUrl(track.thumbnail_path) : null;

  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-24 right-4 z-50 p-2 rounded-full bg-black/95 border shadow-2xl flex items-center space-x-2 cursor-pointer transition-all hover:scale-110 active:scale-95"
        style={{
          borderColor: theme.accent,
          boxShadow: `0 0 25px ${theme.glow}`
        }}
      >
        <div className={`w-10 h-10 rounded-full overflow-hidden border border-white/20 ${isPlaying ? 'animate-spin-slow' : ''}`}>
          {thumb ? (
            <img src={thumb} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-400">
              <Disc size={18} />
            </div>
          )}
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1" />
      </div>
    );
  }

  return (
    <div 
      className="fixed top-20 right-4 sm:right-6 z-50 w-72 sm:w-80 rounded-3xl bg-[#040406]/95 backdrop-blur-2xl border p-4 shadow-2xl text-white transition-all select-none"
      style={{
        borderColor: isPlaying ? theme.accent : 'rgba(255, 255, 255, 0.12)',
        boxShadow: `0 20px 40px rgba(0,0,0,0.9), 0 0 30px ${isPlaying ? theme.glow : 'transparent'}`
      }}
    >
      <video ref={videoRef} className="hidden" muted autoPlay />

      {/* Widget Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
          <span className="text-[10px] font-black font-heading uppercase tracking-widest text-zinc-400">
            Aura Widget Dark
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={togglePictureInPicture}
            title="Ouvrir en fenêtre flottante système (PiP)"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <PictureInPicture2 size={14} />
          </button>
          
          <button
            onClick={() => setIsMinimized(true)}
            title="Réduire en bulle"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <Minimize2 size={14} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Fermer le widget"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Center: Track Artwork & Info */}
      <div className="flex items-center space-x-3.5 mb-3">
        <div 
          className={`relative w-14 h-14 rounded-2xl overflow-hidden bg-black border flex-shrink-0 shadow-lg ${
            isPlaying ? 'animate-spin-slow' : ''
          }`}
          style={{ borderColor: isPlaying ? theme.accent : 'rgba(255,255,255,0.1)' }}
        >
          {thumb ? (
            <img src={thumb} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-400">
              <Disc size={24} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-snug">{track.title}</h4>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{track.artist}</p>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 uppercase mt-1 inline-block">
            {track.format || 'opus'} • {track.bitrate ? `${track.bitrate}k` : '320k'}
          </span>
        </div>

        <button
          onClick={() => onToggleFavorite && onToggleFavorite(track)}
          className={`p-2 rounded-xl transition ${
            track.is_favorite ? 'text-rose-500' : 'text-zinc-500 hover:text-white'
          }`}
        >
          <Heart size={16} fill={track.is_favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Audio-Reactive Spectrum Wave */}
      <div className="w-full h-9 bg-black/60 rounded-xl p-1 mb-3 border border-white/5 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={280}
          height={32}
          className="w-full h-full opacity-90"
        />
      </div>

      {/* Controls: Prev, Play/Pause (Pulsing Glow), Next */}
      <div className="flex items-center justify-between px-2 pt-1">
        <button
          onClick={() => audioEngine.prevTrack()}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition active:scale-90"
        >
          <SkipBack size={18} fill="currentColor" />
        </button>

        <button
          onClick={() => audioEngine.togglePlayPause()}
          className="w-12 h-12 rounded-full flex items-center justify-center text-black shadow-xl transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: theme.accent,
            boxShadow: `0 0 20px ${theme.glow}`
          }}
        >
          {isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <button
          onClick={() => audioEngine.nextTrack()}
          className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition active:scale-90"
        >
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}