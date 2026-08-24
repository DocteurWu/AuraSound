const db = require('./db');

async function migrate() {
  const columns = await db.query('PRAGMA table_info(tracks)');
  const colNames = columns.map(c => c.name);
  console.log('Colonnes actuelles tracks:', colNames);

  if (!colNames.includes('format')) {
    await db.run("ALTER TABLE tracks ADD COLUMN format TEXT DEFAULT 'opus'");
    console.log('✅ Colonne format ajoutée');
  }
  if (!colNames.includes('bitrate')) {
    await db.run("ALTER TABLE tracks ADD COLUMN bitrate INTEGER DEFAULT 160");
    console.log('✅ Colonne bitrate ajoutée');
  }
  if (!colNames.includes('source')) {
    await db.run("ALTER TABLE tracks ADD COLUMN source TEXT DEFAULT 'youtube'");
    console.log('✅ Colonne source ajoutée');
  }
  if (!colNames.includes('youtube_url')) {
    await db.run("ALTER TABLE tracks ADD COLUMN youtube_url TEXT");
    console.log('✅ Colonne youtube_url ajoutée');
  }

  // Inserer un track de demonstration
  await db.run(
    `INSERT OR REPLACE INTO tracks (id, title, artist, album, duration, file_path, format, bitrate, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['demo-cyber-01', 'Resonance (Cyber Mix)', 'HOME & Aura', 'Odyssey HD', 212, 'downloads/music/demo.opus', 'opus', 160, 'youtube']
  );
  console.log('✅ Morceau de démo inséré avec succès');

  // Enregistrer 2 sessions de télémétrie de test (une complète, une skippée)
  const telemetry = require('./services/telemetry');
  await telemetry.recordListeningSession({
    id_morceau: 'demo-cyber-01',
    duree_totale: 212,
    duree_ecoutee: 210,
    progression: 99.1,
    skippe: 0,
    moment_du_skip: null,
    device_info: 'Appareil de test'
  });

  await telemetry.recordListeningSession({
    id_morceau: 'demo-cyber-01',
    duree_totale: 212,
    duree_ecoutee: 45.2,
    progression: 21.3,
    skippe: 1,
    moment_du_skip: 45.2,
    device_info: 'Appareil de test'
  });

  console.log('✅ Sessions de télémétrie de test enregistrées dans SQLite');
  const stats = await telemetry.getListeningStats();
  console.log('📊 Statistiques calculées :', {
    total_sessions: stats.total_sessions,
    total_seconds_listened: stats.total_seconds_listened,
    completion_rate_pct: stats.completion_rate_pct,
    skip_rate_pct: stats.skip_rate_pct
  });

  process.exit(0);
}

migrate().catch(err => {
  console.error('Erreur migration:', err);
  process.exit(1);
});