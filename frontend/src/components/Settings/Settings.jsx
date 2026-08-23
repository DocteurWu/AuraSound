import React, { useState, useRef } from 'react';
import { THEMES } from '../../services/themes';
import { api, getServerUrl, setServerUrl, probeBackendServers } from '../../services/api';
import { Palette, Smartphone, FolderSync, Upload, Loader2, Server } from 'lucide-react';

export default function Settings({ currentTheme, onSelectTheme, theme, onRefreshTracks }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [serverInput, setServerInput] = useState(getServerUrl() || '');
  const [serverStatus, setServerStatus] = useState(null);
  const fileInputRef = useRef(null);

  const handleSaveServer = async () => {
    setServerUrl(serverInput);
    setServerStatus('checking');
    const found = await probeBackendServers();
    if (found && serverInput && found.replace(/\/$/, '') === serverInput.trim().replace(/\/$/, '')) {
      setServerStatus('ok');
    } else if (found) {
      setServerStatus('fallback');
    } else {
      setServerStatus('ko');
    }
    if (onRefreshTracks) await onRefreshTracks();
  };

  const handleScanDevice = async () => {
    setIsScanning(true);
    setScanMessage('');
    try {
      const tracks = await api.scanDeviceAudio();
      if (onRefreshTracks) await onRefreshTracks();
      setScanMessage(`${tracks.length} musiques détectées sur votre téléphone`);
    } catch (e) {
      setScanMessage('Erreur lors du scan');
    } finally {
      setIsScanning(false);
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
      if (onRefreshTracks) await onRefreshTracks();
      setScanMessage('Fichier audio importé');
    } catch (err) {
      setScanMessage('Erreur import');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 sm:p-6 pb-28 animate-fade-in space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold font-heading text-white">Paramètres</h2>
        <p className="text-xs text-zinc-400">Personnalisation et gestion des musiques</p>
      </div>

      {/* Compact Theme Selector */}
      <div className="glass-card rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Palette size={18} style={{ color: theme.accent }} />
            <span className="text-sm font-bold text-white">Thème Visuel</span>
          </div>
          <div className="w-4 h-4 rounded-full shadow-md" style={{ backgroundColor: currentTheme.accent }} />
        </div>

        <select
          value={currentTheme.id}
          onChange={(e) => onSelectTheme(THEMES[e.target.value] || THEMES.cyber)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-semibold focus:outline-none cursor-pointer"
        >
          {Object.values(THEMES).map((t) => (
            <option key={t.id} value={t.id} className="bg-zinc-900 text-white">
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Serveur */}
      <div className="glass-card rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center space-x-2.5">
          <Server size={18} style={{ color: theme.accent }} />
          <span className="text-sm font-bold text-white">Adresse du Serveur</span>
        </div>
        <input
          type="url"
          value={serverInput}
          onChange={(e) => setServerInput(e.target.value)}
          placeholder="http://192.168.1.x:5000 (vide = auto)"
          className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition"
        />
        <button
          onClick={handleSaveServer}
          disabled={serverStatus === 'checking'}
          className="w-full py-2.5 rounded-xl text-xs font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition disabled:opacity-50"
        >
          {serverStatus === 'checking' ? 'Test de connexion...' : 'Enregistrer et tester'}
        </button>
        {serverStatus === 'ok' && (
          <p className="text-[11px] text-emerald-400 font-medium">Serveur connecté</p>
        )}
        {serverStatus === 'fallback' && (
          <p className="text-[11px] text-amber-400 font-medium">Adresse injoignable, serveur détecté automatiquement</p>
        )}
        {serverStatus === 'ko' && (
          <p className="text-[11px] text-red-400 font-medium">Aucun serveur trouvé</p>
        )}
      </div>

      {/* Storage & Local Audio Scanner */}
      <div className="glass-card rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center space-x-2.5">
          <FolderSync size={18} className="text-emerald-400" />
          <span className="text-sm font-bold text-white">Stockage & Musiques du Téléphone</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleScanDevice}
            disabled={isScanning}
            className="py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition disabled:opacity-50"
          >
            {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
            <span>{isScanning ? 'Scan...' : 'Scanner Téléphone'}</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isUploading}
            className="py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 bg-white/10 hover:bg-white/15 text-white border border-white/10 transition disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span>{isUploading ? 'Import...' : 'Importer Audio'}</span>
          </button>
        </div>

        {scanMessage && (
          <p className="text-[11px] text-emerald-400 font-medium text-center pt-1">{scanMessage}</p>
        )}
      </div>
    </div>
  );
}
