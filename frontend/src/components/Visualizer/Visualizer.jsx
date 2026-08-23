import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../../services/audioEngine';

export default function Visualizer({ theme, isPlaying }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const data = audioEngine.getFrequencyData();
      const barCount = 32;
      const barWidth = (width / barCount) - 3;

      for (let i = 0; i < barCount; i++) {
        const val = isPlaying ? (data[i] || Math.sin(Date.now() / 200 + i) * 20 + 20) : 4;
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
        ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
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
