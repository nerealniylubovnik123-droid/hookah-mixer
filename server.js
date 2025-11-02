import express from 'express';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const LIB_PATH = path.join(__dirname, 'data', 'library.json');
const MIX_PATH = path.join(__dirname, 'data', 'mixes.json');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Ошибка чтения', file, e);
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// === API ===
app.get('/api/library', (req, res) => {
  res.json(readJSON(LIB_PATH));
});

app.post('/api/library', (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN)
    return res.status(403).json({ success: false, message: 'Нет доступа' });

  writeJSON(LIB_PATH, req.body);
  res.json({ success: true });
});

app.get('/api/mixes', (req, res) => {
  res.json(readJSON(MIX_PATH));
});

app.post('/api/mixes', (req, res) => {
  const mixes = readJSON(MIX_PATH);
  const newMix = {
    id: Date.now(),
    ...req.body,
    likes: 0,
    createdAt: new Date().toISOString(),
  };
  mixes.push(newMix);
  writeJSON(MIX_PATH, mixes);
  res.json({ success: true, mix: newMix });
});

app.post('/api/mixes/:id/like', (req, res) => {
  const mixes = readJSON(MIX_PATH);
  const id = Number(req.params.id);
  const mix = mixes.find((m) => m.id === id);
  if (!mix) return res.status(404).json({ success: false });
  const delta = req.body.delta || 0;
  mix.likes = Math.max(0, (mix.likes || 0) + delta);
  writeJSON(MIX_PATH, mixes);
  res.json({ success: true, mix });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
