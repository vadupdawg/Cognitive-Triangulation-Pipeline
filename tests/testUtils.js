const Redis = require('ioredis');
const sqlite3 = require('sqlite3').verbose();
const neo4j = require('neo4j-driver');
const config = require('../src/config');

async function clearRedis() {
  const redis = new Redis(config.redisUrl);
  await redis.flushall();
  redis.quit();
}

async function clearSqlite() {
  const db = new sqlite3.Database(config.SQLITE_DB_PATH);
  await new Promise((resolve, reject) => {
    db.exec('DELETE FROM files; DELETE FROM sqlite_sequence;', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  db.close();
}

async function clearNeo4j() {
  const driver = neo4j.driver(config.NEO4J_URI, neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD));
  const session = driver.session();
  await session.run('MATCH (n) DETACH DELETE n');
  await session.close();
  await driver.close();
}

module.exports = {
  clearRedis,
  clearSqlite,
  clearNeo4j,
};