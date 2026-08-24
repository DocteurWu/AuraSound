const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const mm = require('music-metadata');
const crypto = require('crypto');

const db = require('./db');
const telemetry = require('./services/telemetry');

// Token optionnel : demarrer avec AURASOUND_TOKEN=xxx pour proteger
// les routes de modification (POST/PATCH/DELETE) sur le reseau local.
const AUTH_TOKEN = process.env.AURASOUND_TOKEN || '';

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5000;

// Repertoires de stockage
const MUSIC_DIR = path.resolve(__dirname, '../downloads/music');
const THUMB_DIR = path.resolve(__dirname, '../downloads/thumbnails');
const VIDEO_DIR = path.resolve(__dirname, '../downloads/videos');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');

[MUSIC_DIR, THUMB_DIR, VIDEO_DIR, UPLOAD_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json());

// Protection optionnelle des routes de modification
app.use('/api', (req, res, next) => {
  if (!AUTH_TOKEN || req.method === 'GET') return next();
  if (req.headers['x-aurasound-token'] === AUTH_TOKEN) return next();
  return res.status(401).json({ success: false, error: 'Token requis' });
});

// Endpoint de santé pour l'auto-découverte mobile
app.get('/api/health', (req, res) => res.json({ status: 'ok', server: 'AuraSound HD', time: Date.now() }));

// Distribution des fichiers statiques et media
app.use('/music', express.static(MUSIC_DIR));
app.use('/thumbnails', express.static(THUMB_DIR));
app.use('/videos', express.static(VIDEO_DIR));
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// Configuration Multer pour upload local (fichiers audio uniquement, 200 Mo max)
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.opus', '.ogg', '.oga', '.wav', '.flac', '.webm'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MUSIC_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const id = crypto.randomUUID();
    cb(null, `${id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isAudio = (file.mimetype && file.mimetype.startsWith('audio/')) || AUDIO_EXTENSIONS.includes(ext);
    if (!isAudio) return cb(new Error('Type de fichier non autorise (audio uniquement)'));
    cb(null, true);
  }
});

// WebSocket connection handling
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'AuraSound WebSocket actif' }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

const broadcast = (data) => {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

// ==================== ROUTES TRACKS ====================

app.get('/api/tracks', async (req, res) => {
  try {
    const { search, sortBy = 'date_added', sortOrder = 'DESC', filter = 'all' } = req.query;
    let sql = 'SELECT * FROM tracks WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (filter === 'favorites') {
      sql += ' AND is_favorite = 1';
    } else if (filter === 'local') {
      sql += " AND source = 'local_upload'";
    }

    const validSorts = ['date_added', 'title', 'artist', 'duration', 'play_count'];
    const col = validSorts.includes(sortBy) ? sortBy : 'date_added';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${col} ${order}`;

    const tracks = await db.query(sql, params);
    res.json({ success: true, tracks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tracks/:id', async (req, res) => {
  try {
    const track = await db.getOne('SELECT * FROM tracks WHERE id = ?', [req.params.id]);
    if (!track) return res.status(404).json({ success: false, error: 'Morceau non trouve' });
    res.json({ success: true, track });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/tracks/:id', async (req, res) => {
  try {
    const track = await db.getOne('SELECT * FROM tracks WHERE id = ?', [req.params.id]);
    if (!track) return res.status(404).json({ success: false, error: 'Morceau non trouve' });

    if (track.file_path && fs.existsSync(track.file_path)) {
      try { fs.unlinkSync(track.file_path); } catch (e) { console.warn('Impossible de supprimer fichier audio:', e); }
    }

    await db.run('DELETE FROM tracks WHERE id = ?', [req.params.id]);
    broadcast({ type: 'TRACK_DELETED', trackId: req.params.id });

    res.json({ success: true, message: 'Morceau supprime' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tracks/:id', async (req, res) => {
  try {
    const { is_favorite, title, artist, album } = req.body;
    const updates = [];
    const params = [];

    if (is_favorite !== undefined) {
      updates.push('is_favorite = ?');
      params.push(is_favorite ? 1 : 0);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (artist !== undefined) {
      updates.push('artist = ?');
      params.push(artist);
    }
    if (album !== undefined) {
      updates.push('album = ?');
      params.push(album);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun champ a mettre a jour' });
    }

    params.push(req.params.id);
    await db.run(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await db.getOne('SELECT * FROM tracks WHERE id = ?', [req.params.id]);

    broadcast({ type: 'TRACK_UPDATED', track: updated });
    res.json({ success: true, track: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/tracks/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Aucun fichier audio fourni' });
    }

    const filePath = req.file.path;
    let metadata = { common: {}, format: {} };
    try {
      metadata = await mm.parseFile(filePath);
    } catch (parseErr) {
      console.warn('Metadata parsing non bloquant:', parseErr.message);
    }

    const id = crypto.randomUUID();
    const title = metadata.common.title || path.parse(req.file.originalname).name;
    const artist = metadata.common.artist || 'Artiste inconnu';
    const album = metadata.common.album || 'Import local';
    const duration = metadata.format.duration || 0;
    const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase();
    const bitrate = metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : 320;

    let thumbPath = null;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbFullPath = path.join(THUMB_DIR, thumbFilename);
      fs.writeFileSync(thumbFullPath, pic.data);
      thumbPath = `/thumbnails/${thumbFilename}`;
    }

    const track = {
      id,
      title,
      artist,
      album,
      duration,
      file_path: filePath,
      thumbnail_path: thumbPath,
      file_size: req.file.size,
      format: ext,
      bitrate,
      source: 'local_upload'
    };

    await db.run(
      `INSERT INTO tracks (id, title, artist, album, duration, file_path, thumbnail_path, file_size, format, bitrate, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [track.id, track.title, track.artist, track.album, track.duration, track.file_path, track.thumbnail_path, track.file_size, track.format, track.bitrate, track.source]
    );

    broadcast({ type: 'TRACK_ADDED', track });
    res.json({ success: true, track });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ROUTES PLAYLISTS ====================

app.get('/api/playlists', async (req, res) => {
  try {
    const playlists = await db.query(`
      SELECT 
        p.*,
        COUNT(pt.track_id) as track_count,
        COALESCE(SUM(t.duration), 0) as total_duration
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
      LEFT JOIN tracks t ON pt.track_id = t.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, playlists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists', async (req, res) => {
  try {
    const { name, description = '', cover_url = null } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nom requis' });

    const id = crypto.randomUUID();
    await db.run(
      'INSERT INTO playlists (id, name, description, cover_url) VALUES (?, ?, ?, ?)',
      [id, name, description, cover_url]
    );

    const playlist = await db.getOne('SELECT * FROM playlists WHERE id = ?', [id]);
    broadcast({ type: 'PLAYLIST_CREATED', playlist });
    res.json({ success: true, playlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const playlist = await db.getOne('SELECT * FROM playlists WHERE id = ?', [req.params.id]);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist non trouvee' });

    const tracks = await db.query(`
      SELECT t.*, pt.position, pt.added_at as in_playlist_since
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position ASC, pt.added_at ASC
    `, [req.params.id]);

    res.json({ success: true, playlist, tracks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists/:id/tracks', async (req, res) => {
  try {
    const { track_id } = req.body;
    if (!track_id) return res.status(400).json({ success: false, error: 'track_id requis' });

    const count = await db.getOne('SELECT COUNT(*) as cnt FROM playlist_tracks WHERE playlist_id = ?', [req.params.id]);
    const pos = count ? count.cnt : 0;

    await db.run(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
      [req.params.id, track_id, pos]
    );

    res.json({ success: true, message: 'Morceau ajoute a la playlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id/tracks/:trackId', async (req, res) => {
  try {
    await db.run(
      'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?',
      [req.params.id, req.params.trackId]
    );
    res.json({ success: true, message: 'Morceau retire de la playlist' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM playlists WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Playlist supprimee' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ROUTES TELEMETRIE & STATISTIQUES ====================

app.post('/api/telemetry/session', async (req, res) => {
  try {
    const session = await telemetry.recordListeningSession(req.body);
    broadcast({ type: 'TELEMETRY_RECORDED', session });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/telemetry/stats', async (req, res) => {
  try {
    const stats = await telemetry.getListeningStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/telemetry/export', async (req, res) => {
  try {
    const format = req.query.format === 'json' ? 'json' : 'csv';
    const data = await telemetry.exportHistory(format);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="aurasound_telemetrie_${timestamp}.json"`);
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aurasound_telemetrie_${timestamp}.csv"`);
    }

    res.send(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== INFOS SYSTEME & RESEAU ====================

app.get('/api/system/info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }

  res.json({
    success: true,
    port: PORT,
    local_ips: addresses,
    device_name: os.hostname(),
    offline_mode: true,
    storage: {
      music_dir: MUSIC_DIR,
      video_dir: VIDEO_DIR
    }
  });
});

// Gestion centralisee des erreurs (ex: rejet multer)
app.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.message)) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
  next(err);
});

// Catch-all SPA route
app.get('*', (req, res) => {
  if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  } else {
    res.send('AuraSound Backend actif');
  }
});

// Lancer le serveur
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AuraSound Server demarre avec succes sur http://0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket en ecoute sur ws://0.0.0.0:${PORT}`);
});