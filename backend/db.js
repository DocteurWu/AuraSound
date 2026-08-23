const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'aurasound.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erreur ouverture SQLite:', err.message);
  } else {
    console.log('✅ Base de donnees SQLite connectee:', DB_PATH);
  }
});

db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT DEFAULT 'Artiste inconnu',
      album TEXT DEFAULT 'Single',
      duration REAL DEFAULT 0,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      file_size INTEGER DEFAULT 0,
      format TEXT DEFAULT 'opus',
      bitrate INTEGER DEFAULT 160,
      source TEXT DEFAULT 'youtube',
      youtube_url TEXT,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      play_count INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listening_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_morceau TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      duree_totale REAL NOT NULL,
      duree_ecoutee REAL NOT NULL,
      progression REAL NOT NULL,
      skippe INTEGER NOT NULL DEFAULT 0,
      moment_du_skip REAL,
      nombre_de_lectures_completes INTEGER DEFAULT 0,
      derniere_ecoute DATETIME DEFAULT CURRENT_TIMESTAMP,
      device_info TEXT DEFAULT 'Appareil inconnu',
      FOREIGN KEY (id_morceau) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_history_track ON listening_history(id_morceau)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_time ON listening_history(timestamp)');
});

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const getOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

module.exports = {
  db,
  query,
  getOne,
  run
};
