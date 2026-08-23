import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { 
  BarChart3, Clock, PlayCircle, SkipForward, CheckCircle2, 
  FileSpreadsheet, FileCode, TrendingUp 
} from 'lucide-react';

export default function Analytics({ theme }) {
  const getInitialStats = () => {
    try {
      const sessions = JSON.parse(localStorage.getItem('aurasound_sessions') || '[]');
      const total_sessions = sessions.length;
      const total_seconds_listened = sessions.reduce((acc, s) => acc + (s.duree_ecoutee || 0), 0);
      const total_completed = sessions.filter(s => !s.skippe).length;
      const total_skipped = sessions.filter(s => s.skippe).length;
      const completion_rate_pct = total_sessions > 0 ? (total_completed / total_sessions) * 100 : 0;
      const skip_rate_pct = total_sessions > 0 ? (total_skipped / total_sessions) * 100 : 0;

      return {
        total_sessions,
        total_seconds_listened,
        total_completed,
        total_skipped,
        completion_rate_pct,
        skip_rate_pct,
        top_tracks: [],
        top_artists: [],
        recent_sessions: [],
        hourly_distribution: []
      };
    } catch (e) {
      return {
        total_sessions: 0,
        total_seconds_listened: 0,
        total_completed: 0,
        total_skipped: 0,
        completion_rate_pct: 0,
        skip_rate_pct: 0,
        top_tracks: [],
        top_artists: [],
        recent_sessions: [],
        hourly_distribution: []
      };
    }
  };

  const [rawStats, setRawStats] = useState(getInitialStats);

  useEffect(() => {
    api.getTelemetryStats().then(res => {
      if (res && res.success && res.stats) setRawStats(res.stats);
    }).catch(() => {});
  }, []);

  const stats = {
    total_sessions: rawStats?.total_sessions || 0,
    total_seconds_listened: rawStats?.total_seconds_listened || 0,
    total_completed: rawStats?.total_completed || 0,
    total_skipped: rawStats?.total_skipped || 0,
    completion_rate_pct: rawStats?.completion_rate_pct || 0,
    skip_rate_pct: rawStats?.skip_rate_pct || 0,
    top_tracks: Array.isArray(rawStats?.top_tracks) ? rawStats.top_tracks : [],
    top_artists: Array.isArray(rawStats?.top_artists) ? rawStats.top_artists : [],
    recent_sessions: Array.isArray(rawStats?.recent_sessions) ? rawStats.recent_sessions : [],
    hourly_distribution: Array.isArray(rawStats?.hourly_distribution) ? rawStats.hourly_distribution : []
  };

  const formatHours = (seconds) => {
    if (!seconds) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  const handleExport = (format) => {
    window.open(api.getExportUrl(format), '_blank');
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-28 animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold font-heading text-white">Statistiques</h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Aperçu rapide de vos habitudes d'écoute
          </p>
        </div>

        {/* 1-Click Export Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center space-x-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition shadow-lg"
          >
            <FileSpreadsheet size={15} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center space-x-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 transition shadow-lg"
          >
            <FileCode size={15} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-3xl p-4 border border-white/5 space-y-1">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs">
            <Clock size={14} />
            <span>Temps d'écoute</span>
          </div>
          <p className="text-xl sm:text-2xl font-black font-heading text-white">
            {formatHours(stats.total_seconds_listened)}
          </p>
          <span className="text-[10px] text-zinc-500">Temps actif réel</span>
        </div>

        <div className="glass-card rounded-3xl p-4 border border-white/5 space-y-1">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs">
            <PlayCircle size={14} />
            <span>Sessions d'écoute</span>
          </div>
          <p className="text-xl sm:text-2xl font-black font-heading text-white">
            {stats.total_sessions}
          </p>
          <span className="text-[10px] text-zinc-500">Lectures enregistrées</span>
        </div>

        <div className="glass-card rounded-3xl p-4 border border-white/5 space-y-1">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>Taux Complétion</span>
          </div>
          <p className="text-xl sm:text-2xl font-black font-heading text-emerald-400">
            {Math.round(stats.completion_rate_pct)}%
          </p>
          <span className="text-[10px] text-zinc-500">{stats.total_completed} complets</span>
        </div>

        <div className="glass-card rounded-3xl p-4 border border-white/5 space-y-1">
          <div className="flex items-center space-x-2 text-zinc-400 text-xs">
            <SkipForward size={14} className="text-amber-400" />
            <span>Taux de Skip</span>
          </div>
          <p className="text-xl sm:text-2xl font-black font-heading text-amber-400">
            {Math.round(stats.skip_rate_pct)}%
          </p>
          <span className="text-[10px] text-zinc-500">{stats.total_skipped} passés</span>
        </div>
      </div>

      {/* Hourly Listening Distribution Chart */}
      <div className="glass-card rounded-3xl p-5 border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <TrendingUp size={18} style={{ color: theme.accent }} />
            <span>Activité d'Écoute par Heure de la Journée</span>
          </h3>
          <span className="text-xs text-zinc-500">24 Heures</span>
        </div>

        {/* 24-hour histogram */}
        <div className="h-32 flex items-end justify-between gap-1 pt-4 px-2">
          {Array.from({ length: 24 }).map((_, h) => {
            const hourStr = h.toString().padStart(2, '0');
            const found = stats.hourly_distribution.find(item => item.hour === hourStr);
            const count = found ? (found.count || 0) : 0;
            const maxVal = stats.hourly_distribution.length > 0 
              ? Math.max(1, ...stats.hourly_distribution.map(d => d.count || 0)) 
              : 1;
            const heightPct = count > 0 ? Math.max(15, (count / maxVal) * 100) : 6;

            return (
              <div key={h} className="flex-1 flex flex-col items-center group relative">
                <div 
                  className="w-full rounded-t-sm transition-all group-hover:brightness-125"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: count > 0 ? theme.accent : 'rgba(255,255,255,0.06)',
                    boxShadow: count > 0 ? `0 0 8px ${theme.glow}` : undefined
                  }}
                />
                <span className="text-[9px] text-zinc-600 mt-1 font-mono">
                  {h % 4 === 0 ? `${h}h` : ''}
                </span>
                
                {/* Tooltip on hover */}
                {count > 0 && (
                  <div className="absolute -top-7 px-2 py-0.5 rounded bg-black/90 border border-white/10 text-[10px] text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-20 pointer-events-none">
                    {h}h: {count} écoute{count > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Tracks & Top Artists Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Tracks */}
        <div className="glass-card rounded-3xl p-5 border border-white/5 space-y-3">
          <h3 className="text-base font-bold text-white">Top 5 Morceaux les Plus Écoutés</h3>
          {stats.top_tracks.length === 0 ? (
            <p className="text-xs text-zinc-500">Aucune donnée d'écoute pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {stats.top_tracks.slice(0, 5).map((track, i) => (
                <div key={track.id || i} className="flex items-center justify-between p-2.5 rounded-2xl bg-black/30 border border-white/5">
                  <div className="flex items-center space-x-3 min-w-0 mr-2">
                    <span className="text-xs font-black font-heading text-zinc-500 w-4">#{i+1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{track.title || 'Titre'}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{track.artist || 'Artiste'}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: theme.accent }}>
                      {formatHours(track.total_listened_sec)}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {track.sessions_count || 0} sessions ({track.completed_count || 0} ✅)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Artists */}
        <div className="glass-card rounded-3xl p-5 border border-white/5 space-y-3">
          <h3 className="text-base font-bold text-white">Top Artistes</h3>
          {stats.top_artists.length === 0 ? (
            <p className="text-xs text-zinc-500">Aucune donnée d'artiste.</p>
          ) : (
            <div className="space-y-2">
              {stats.top_artists.slice(0, 5).map((art, i) => (
                <div key={art.artist || i} className="flex items-center justify-between p-2.5 rounded-2xl bg-black/30 border border-white/5">
                  <div className="flex items-center space-x-3 min-w-0 mr-2">
                    <span className="text-xs font-black font-heading text-zinc-500 w-4">#{i+1}</span>
                    <p className="text-xs font-bold text-white truncate">{art.artist || 'Artiste'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: theme.accent }}>
                      {formatHours(art.total_listened_sec)}
                    </p>
                    <p className="text-[10px] text-zinc-500">{art.sessions_count || 0} streams</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="glass-card rounded-3xl p-5 border border-white/5 space-y-3">
        <h3 className="text-base font-bold text-white">Dernières Sessions Enregistrées</h3>
        {stats.recent_sessions.length === 0 ? (
          <p className="text-xs text-zinc-500">Vos sessions d'écoute apparaîtront ici en direct.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 text-[11px]">
                  <th className="pb-2 font-medium">Morceau</th>
                  <th className="pb-2 font-medium">Écouté</th>
                  <th className="pb-2 font-medium">Progression</th>
                  <th className="pb-2 font-medium">Statut</th>
                  <th className="pb-2 font-medium text-right">Date & Heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.recent_sessions.slice(0, 10).map((s, idx) => (
                  <tr key={s.id || idx} className="hover:bg-white/5 transition">
                    <td className="py-2.5 pr-2">
                      <p className="font-bold text-white truncate max-w-[160px]">{s.title || 'Titre'}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{s.artist || 'Artiste'}</p>
                    </td>
                    <td className="py-2.5 font-mono text-zinc-300">
                      {Math.floor((s.duree_ecoutee || 0) / 60)}:{((s.duree_ecoutee || 0) % 60).toString().padStart(2, '0')}
                    </td>
                    <td className="py-2.5">
                      <div className="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round(s.pourcentage_ecoute || 0))}%`,
                            backgroundColor: s.skippe ? '#f59e0b' : '#10b981'
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.skippe ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {s.skippe ? 'Skippé' : 'Complet'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-[10px] text-zinc-500">
                      {s.timestamp ? new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Récemment'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}