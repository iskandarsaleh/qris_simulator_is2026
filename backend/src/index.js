require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const Redis   = require('./services/redis');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../frontend')));

// Routes
app.use('/api/qris',        require('./routes/qris'));
app.use('/api/iso8583',     require('./routes/iso8583'));
app.use('/api/tlv',         require('./routes/tlv'));
app.use('/api/transaction', require('./routes/transaction'));

// Health check
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    redis: Redis.isConnected() ? 'CONNECTED' : 'IN-MEMORY FALLBACK',
    version: '1.0.0',
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// Start
async function start() {
  await Redis.connect();
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║         QRIS SIMULATOR - Fullstack v1.0          ║
  ╠══════════════════════════════════════════════════╣
  ║  Frontend  : http://localhost:${PORT}              ║
  ║  API       : http://localhost:${PORT}/api           ║
  ║  Redis     : ${Redis.isConnected() ? 'CONNECTED' : 'IN-MEMORY FALLBACK'}                         ║
  ╚══════════════════════════════════════════════════╝
    `);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
