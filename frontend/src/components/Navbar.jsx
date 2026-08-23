import React from 'react';
import { Music2, Download, BarChart2, ListMusic, Settings as SettingsIcon } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'library', label: 'Bibliothèque', icon: Music2 },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'analytics', label: 'Statistiques', icon: BarChart2 },
  { id: 'settings', label: 'Paramètres', icon: SettingsIcon }
];

export default function Navbar({ activeTab, onTabChange, theme }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#08090d]/90 backdrop-blur-2xl border-t border-white/10 safe-pb">
      <div className="max-w-md mx-auto flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex flex-col items-center justify-center w-16 py-1 transition-all group relative"
            >
              {/* Active Indicator Glow */}
              {isActive && (
                <div 
                  className="absolute -top-2 w-8 h-1 rounded-full"
                  style={{ 
                    backgroundColor: theme.accent,
                    boxShadow: `0 0 10px ${theme.glow}`
                  }}
                />
              )}

              <div 
                className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'scale-110' : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
                style={{ color: isActive ? theme.accent : undefined }}
              >
                <Icon size={20} />
              </div>

              <span 
                className={`text-[10px] font-semibold transition-all ${
                  isActive ? 'font-bold' : 'text-zinc-500'
                }`}
                style={{ color: isActive ? '#ffffff' : undefined }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
