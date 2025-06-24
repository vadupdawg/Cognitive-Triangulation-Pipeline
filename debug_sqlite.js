const { DatabaseManager } = require('./src/utils/sqliteDb');

const dbPath = process.env.SQLITE_DB_PATH || './database.db';
const dbManager = new DatabaseManager(dbPath);
dbManager.initializeDb();
const db = dbManager.getDb();

console.log('=== POIs from utils.py ===');
const pois = db.prepare(`
  SELECT p.*, f.path as file_path
  FROM pois p
  JOIN files f ON p.file_id = f.id
  WHERE f.path LIKE ?
`).all('%utils.py');
console.log('Total POIs found:', pois.length);
pois.forEach(poi => {
  console.log(`- ${poi.type}: ${poi.name} (line ${poi.line_number})`);
});

console.log('\n=== Relationships involving utils.py POIs ===');
const relationships = db.prepare(`
  SELECT r.*, p1.name as source_name, p2.name as target_name, f1.path as source_file, f2.path as target_file
  FROM relationships r
  JOIN pois p1 ON r.source_poi_id = p1.id
  JOIN pois p2 ON r.target_poi_id = p2.id
  JOIN files f1 ON p1.file_id = f1.id
  JOIN files f2 ON p2.file_id = f2.id
  WHERE f1.path LIKE '%utils.py' OR f2.path LIKE '%utils.py'
`).all();
console.log('Total relationships:', relationships.length);
relationships.forEach(rel => {
  console.log(`- ${rel.source_name} ${rel.type} ${rel.target_name} (${rel.source_file} -> ${rel.target_file})`);
});

console.log('\n=== Overall Statistics ===');
const totalPois = db.prepare('SELECT COUNT(*) as count FROM pois').get();
const totalRelationships = db.prepare('SELECT COUNT(*) as count FROM relationships').get();
console.log(`Total POIs: ${totalPois.count}`);
console.log(`Total Relationships: ${totalRelationships.count}`);

console.log('\n=== POI Types Distribution ===');
const poiTypes = db.prepare('SELECT type, COUNT(*) as count FROM pois GROUP BY type ORDER BY count DESC').all();
poiTypes.forEach(type => {
  console.log(`- ${type.type}: ${type.count}`);
});

console.log('\n=== Relationship Types Distribution ===');
const relTypes = db.prepare('SELECT type, COUNT(*) as count FROM relationships GROUP BY type ORDER BY count DESC').all();
relTypes.forEach(type => {
  console.log(`- ${type.type}: ${type.count}`);
});