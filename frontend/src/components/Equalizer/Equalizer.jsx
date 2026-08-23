import React, { useState } from 'react';
import { audioEngine } from '../../services/audioEngine';
import { Sliders, X, Sparkles, Volume2 } from 'lucide-react';

const PRESETS = {
  'Plat': [0, 0, 0, 0, 0],
  'Bass Boost': [8, 5, 0, 1, 2],
  'Club & Electro': [6, 4, -1, 3, 4],
  'Vocal & Clarté': [-2, -1, 6, 4, 1],
  'Rock Dynamique': [5, 3, -2, 4, 6],
  'Aigus Purs': [-3, 0, 2, 5, 8]
};

const BANDS = [
  { label: '60 Hz', sub: 'Sub-Bass' },
  { label: '250 Hz', sub: 'Basses' },
  { label: '1 kHz', sub: 'Médiums' },
  { label: '4 kHz', sub: 'Présence' },
  { label: '16 kHz', sub: 'Aigus' }
];

export default function EqualizerModal({ isOpen, onClose, theme }) {
  const [activePreset, setActivePreset] = useState('Plat');
  const [gains, setGains] = useState([0, 0, 0, 0, 0]);

  if (!isOpen) return null;

  const handleGainChange = (index, val) => {
    const newGains = [...gains];
    newGains[index] = parseFloat(val);
    setGains(newGains);
    setActivePreset('Personnalisé');
    audioEngine.setEqualizerBand(index, newGains[index]);
  };

  const handleApplyPreset = (name) => {
    const presetGains = PRESETS[name];
    setActivePreset(name);
    setGains(presetGains);
    audioEngine.applyEQPreset(presetGains);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-md rounded-3xl p-6 relative border shadow-2xl glass-card text-white"
        style={{ borderColor: theme.border }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-white/10 text-cyan-400" style={{ color: theme.accent }}>
              <Sliders size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold font-heading">Égaliseur Audio Studio</h3>
              <p className="text-xs text-zinc-400">Traitement sonore DSP 5 Bandes</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Presets Chips */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2.5">Préréglages</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(PRESETS).map((p) => (
              <button
                key={p}
                onClick={() => handleApplyPreset(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activePreset === p
                    ? 'text-black font-bold shadow-lg'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/5'
                }`}
                style={{
                  backgroundColor: activePreset === p ? theme.accent : undefined,
                  boxShadow: activePreset === p ? `0 0 15px ${theme.glow}` : undefined
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders 5 Bandes */}
        <div className="grid grid-cols-5 gap-3 bg-black/40 p-4 rounded-2xl border border-white/5 mb-6">
          {BANDS.map((band, idx) => (
            <div key={band.label} className="flex flex-col items-center space-y-3">
              <span className="text-[11px] font-mono text-zinc-400">
                {gains[idx] > 0 ? `+${gains[idx]}` : gains[idx]}dB
              </span>
              
              <div className="h-36 flex items-center justify-center">
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={gains[idx]}
                  onChange={(e) => handleGainChange(idx, e.target.value)}
                  className="w-32 -rotate-90 origin-center accent-cyan-400 cursor-pointer"
                  style={{ accentColor: theme.accent }}
                />
              </div>

              <div className="text-center">
                <span className="text-xs font-bold block text-zinc-200">{band.label}</span>
                <span className="text-[9px] text-zinc-500 block leading-tight">{band.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl font-bold text-sm bg-white/10 hover:bg-white/15 text-white transition border border-white/10"
        >
          Appliquer et Fermer
        </button>
      </div>
    </div>
  );
}
