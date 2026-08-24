import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../services/audioEngine';

export default function Visualizer({ theme, isPlaying }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let lastFrame = 0;
    const targetFPS = 24; // limite pour économie batterie
    const frameInterval = 1000 / targetFPS;

    const render = (now) => {
      animationFrameId = requestAnimationFrame(render);
      // Economie batterie : pause si onglet caché / écran éteint ou pas en lecture
      if (document.hidden) return;
      if (!isPlaying) {
        // Dessin statique minimal une fois, puis pause
        if (now - lastFrame < 1000) return;
      } else {
        if (now - lastFrame < frameInterval) return;
      }
      lastFrame = now;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const data = isPlaying && !document.hidden ? audioEngine.getFrequencyData() : null;
      const barCount = 32;
      const barWidth = (width / barCount) - 3;

      for (let i = 0; i < barCount; i++) {
        const val = isPlaying ? (data ? (data[i] || 0) : (Math.sin(Date.now() / 200 + i) * 20 + 20)) : 4;
        const barHeight = Math.max(3, (val / 255) * height * 0.85);

        const x = i * (barWidth + 3);
        const y = height - barHeight;

        // Gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, `${theme.accent}33`);
        gradient.addColorStop(0.7, theme.accent);
        gradient.addColorStop(1, '#ffffff');

        ctx.fillStyle = gradient;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = isPlaying ? 10 : 2;

        // Rounded bar top
        ctx.beginPath();
        // Fallback for browsers without roundRect
        if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        else ctx.fillRect(x, y, barWidth, barHeight);
        ctx.fill();
      }
    };

    animationFrameId = requestAnimationFrame(render);

    const onVis = () => { if (!document.hidden && isPlaying) lastFrame = 0; };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [theme, isPlaying]);

  return (
    <div className="w-full h-16 relative flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        width={320}
        height={60}
        className="w-full h-full opacity-90"
      />
    </div>
  );
}
