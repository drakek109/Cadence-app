import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json());

// Expose configuration if set
app.get('/api/config', (_req, res) => {
  res.json({
    firebaseApiKey: process.env.FIREBASE_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  });
});

// Serve static assets from project root
app.use(express.static(__dirname));

// Single-page fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Cadence cockpit running on http://${HOST}:${PORT}`);
});
