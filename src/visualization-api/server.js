const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { execute } = require('./src/utils/sqliteDb');
const { initializeDb } = require('./src/utils/initializeDb');
const driver = require('./src/utils/neo4jDriver');
const app = express();
const port = 3001;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware to parse JSON bodies
app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

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

// Stats endpoints for Pipeline Dashboard
app.get('/api/stats/work_queue/pending', async (req, res) => {
  try {
    const rows = await execute("SELECT COUNT(*) as count FROM work_queue WHERE status = 'pending'");
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

app.get('/api/stats/work_queue/processing', async (req, res) => {
  try {
    const rows = await execute("SELECT COUNT(*) as count FROM work_queue WHERE status = 'processing'");
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

app.get('/api/stats/analysis_results/pending_ingestion', async (req, res) => {
  try {
    const rows = await execute("SELECT COUNT(*) as count FROM analysis_results WHERE status = 'pending_ingestion'");
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

app.get('/api/stats/failed_work/count', async (req, res) => {
  try {
    const rows = await execute('SELECT COUNT(*) as count FROM failed_work');
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error querying the database');
  }
});

// Neo4j graph query endpoint
app.post('/api/graph/query', async (req, res) => {
  const session = driver.session();
  
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const result = await session.run(query);
    
    // Transform Neo4j result to a more JSON-friendly format
    const records = result.records.map(record => {
      const obj = {};
      record.keys.forEach((key, index) => {
        const value = record.get(key);
        // Handle Neo4j types that need conversion
        if (value && typeof value === 'object' && value.constructor.name === 'Integer') {
          obj[key] = value.toNumber();
        } else if (value && typeof value === 'object' && value.properties) {
          // Node or Relationship
          obj[key] = {
            ...value.properties,
            labels: value.labels || undefined,
            type: value.type || undefined
          };
        } else {
          obj[key] = value;
        }
      });
      return obj;
    });
    
    res.json({
      records,
      summary: {
        queryType: result.summary.queryType,
        counters: result.summary.counters
      }
    });
    
  } catch (err) {
    console.error('Neo4j query error:', err.message);
    res.status(500).json({
      error: 'Error executing Neo4j query',
      details: err.message
    });
  } finally {
    await session.close();
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  
  // Send welcome message to new client
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Welcome to the Pipeline Dashboard Log Stream',
    timestamp: new Date().toISOString()
  }));
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Function to broadcast messages to all connected clients
function broadcastToClients(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

async function startServer() {
  await initializeDb();
  server.listen(port, () => {
    console.log(`Visualization API server listening at http://localhost:${port}`);
    console.log(`WebSocket server ready for connections`);
  });
}

startServer();