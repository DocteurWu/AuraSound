const db = require('../db');

/**
 * Enregistre une session d'ecoute avec toutes les metriques detaillees
 */
async function recordListeningSession({
  id_morceau,
  timestamp = new Date().toISOString(),
  duree_totale,
  duree_ecoutee,
  progression,
  skippe,
  moment_du_skip = null,
  device_info = 'Appareil inconnu'
}) {
  try {
    const track = await db.getOne('SELECT * FROM tracks WHERE id = ?', [id_morceau]);
    if (!track) {
      throw new Error(`Morceau ID ${id_morceau} introuvable`);
    }

    const countRow = await db.getOne(
      'SELECT COUNT(*) as total_full FROM listening_history WHERE id_morceau = ? AND skippe = 0',
      [id_morceau]
    );

    let nombre_de_lectures_completes = countRow ? countRow.total_full : 0;
    const isCompleted = !skippe && (progression >= 90 || duree_ecoutee >= (duree_totale * 0.9));

    if (isCompleted) {
      nombre_de_lectures_completes += 1;
      await db.run('UPDATE tracks SET play_count = play_count + 1 WHERE id = ?', [id_morceau]);
    }

    const derniere_ecoute = new Date().toISOString();

    const insertResult = await db.run(
      `INSERT INTO listening_history 
       (id_morceau, timestamp, duree_totale, duree_ecoutee, progression, skippe, moment_du_skip, nombre_de_lectures_completes, derniere_ecoute, device_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_morceau,
        timestamp,
        duree_totale || track.duration || 0,
        duree_ecoutee || 0,
        progression || 0,
        skippe ? 1 : 0,
        moment_du_skip,
        nombre_de_lectures_completes,
        derniere_ecoute,
        device_info
      ]
    );

    return {
      history_id: insertResult.lastID,
      id_morceau,
      timestamp,
      duree_totale,
      duree_ecoutee,
      progression,
      skippe: skippe ? 1 : 0,
      moment_du_skip,
      nombre_de_lectures_completes,
      derniere_ecoute,
      device_info
    };
  } catch (err) {
    console.error('Erreur recordListeningSession:', err);
    throw err;
  }
}

/**
 * Recupere des statistiques poussees d'ecoute
 */
async function getListeningStats() {
  try {
    const globalStats = await db.getOne(`
      SELECT 
        COUNT(*) as total_sessions,
        COALESCE(SUM(duree_ecoutee), 0) as total_seconds_listened,
        COALESCE(SUM(CASE WHEN skippe = 0 THEN 1 ELSE 0 END), 0) as total_completed,
        COALESCE(SUM(CASE WHEN skippe = 1 THEN 1 ELSE 0 END), 0) as total_skipped,
        COALESCE(AVG(progression), 0) as avg_progression
      FROM listening_history
    `);

    const topTracks = await db.query(`
      SELECT 
        t.id, t.title, t.artist, t.thumbnail_path, t.duration,
        COUNT(h.id) as sessions_count,
        COALESCE(SUM(h.duree_ecoutee), 0) as total_listened_sec,
        COALESCE(SUM(CASE WHEN h.skippe = 0 THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(CASE WHEN h.skippe = 1 THEN 1 ELSE 0 END), 0) as skipped_count
      FROM tracks t
      LEFT JOIN listening_history h ON t.id = h.id_morceau
      GROUP BY t.id
      ORDER BY total_listened_sec DESC, sessions_count DESC
      LIMIT 10
    `);

    const topArtists = await db.query(`
      SELECT 
        t.artist,
        COUNT(h.id) as sessions_count,
        COALESCE(SUM(h.duree_ecoutee), 0) as total_listened_sec
      FROM tracks t
      JOIN listening_history h ON t.id = h.id_morceau
      GROUP BY t.artist
      ORDER BY total_listened_sec DESC
      LIMIT 8
    `);

    const hourly = await db.query(`
      SELECT 
        strftime('%H', timestamp) as hour,
        COUNT(*) as count,
        SUM(duree_ecoutee) as total_sec
      FROM listening_history
      GROUP BY hour
      ORDER BY hour ASC
    `);

    const recentSessions = await db.query(`
      SELECT 
        h.*,
        t.title, t.artist, t.thumbnail_path, t.format, t.bitrate
      FROM listening_history h
      JOIN tracks t ON h.id_morceau = t.id
      ORDER BY h.timestamp DESC
      LIMIT 30
    `);

    const totalSessions = globalStats.total_sessions || 0;
    const skipRate = totalSessions > 0 ? ((globalStats.total_skipped / totalSessions) * 100).toFixed(1) : 0;
    const completionRate = totalSessions > 0 ? ((globalStats.total_completed / totalSessions) * 100).toFixed(1) : 0;

    return {
      total_sessions: totalSessions,
      total_seconds_listened: globalStats.total_seconds_listened,
      total_completed: globalStats.total_completed,
      total_skipped: globalStats.total_skipped,
      avg_progression: parseFloat((globalStats.avg_progression || 0).toFixed(1)),
      skip_rate_pct: parseFloat(skipRate),
      completion_rate_pct: parseFloat(completionRate),
      top_tracks: topTracks,
      top_artists: topArtists,
      hourly_distribution: hourly,
      recent_sessions: recentSessions
    };
  } catch (err) {
    console.error('Erreur getListeningStats:', err);
    throw err;
  }
}

/**
 * Exporte l'historique complet en CSV ou JSON
 */
async function exportHistory(format = 'csv') {
  const rows = await db.query(`
    SELECT 
      h.id as history_id,
      h.id_morceau,
      t.title as titre,
      t.artist as artiste,
      t.album as album,
      t.format as format_audio,
      t.bitrate as bitrate_kbps,
      h.timestamp,
      ROUND(h.duree_totale, 2) as duree_totale_sec,
      ROUND(h.duree_ecoutee, 2) as duree_ecoutee_sec,
      ROUND(h.progression, 2) as progression_pct,
      h.skippe,
      h.moment_du_skip,
      h.nombre_de_lectures_completes,
      h.derniere_ecoute,
      h.device_info
    FROM listening_history h
    JOIN tracks t ON h.id_morceau = t.id
    ORDER BY h.timestamp DESC
  `);

  if (format === 'json') {
    return JSON.stringify(rows, null, 2);
  }

  if (rows.length === 0) {
    return 'history_id,id_morceau,titre,artiste,album,format_audio,bitrate_kbps,timestamp,duree_totale_sec,duree_ecoutee_sec,progression_pct,skippe,moment_du_skip_sec,nombre_de_lectures_completes,derniere_ecoute,device_info\n';
  }

  const headers = Object.keys(rows[0]);
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCsv(row[h])).join(','))
  ];

  return csvLines.join('\n');
}

module.exports = {
  recordListeningSession,
  getListeningStats,
  exportHistory
};
