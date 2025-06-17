const express = require('express');
const { execute } = require('./src/utils/sqliteDb');
const { initializeDb } = require('./src/utils/initializeDb');
const app = express();
const port = 3001;

app.get('/', (req, res) => {
  res.send('Hello from the visualization API!');
});

app.get('/api/work_queue', async (req, res) => {
  try {
    const rows = await execute('SELECT * FROM work_queue');
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

app.get('/api/analysis_results', async (req, res) => {
  try {
    const rows = await execute('SELECT * FROM analysis_results');
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

app.get('/api/failed_work', async (req, res) => {
  try {
    const rows = await execute('SELECT * FROM failed_work');
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

async function startServer() {
  await initializeDb();
  app.listen(port, () => {
    console.log(`Visualization API server listening at http://localhost:${port}`);
  });
}

startServer();