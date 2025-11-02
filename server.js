import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 8080;
const ADMIN_TG_IDS = (process.env.ADMIN_TG_IDS || "504348666,2015942051").split(",").map(s => s.trim());
const DEV_ALLOW_UNSAFE = process.env.DEV_ALLOW_UNSAFE === "true";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const libraryFile = path.join(dataDir, "library.json");
const mixesFile = path.join(dataDir, "mixes.json");

// helpers
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8") || "[]");
  } catch (e) {
    console.error("JSON read error:", e);
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// initialize files
if (!fs.existsSync(libraryFile)) writeJSON(libraryFile, []);
if (!fs.existsSync(mixesFile)) writeJSON(mixesFile, []);

// check admin
function isAdmin(req) {
  const id = req.header("x-admin-id");
  return DEV_ALLOW_UNSAFE || (id && ADMIN_TG_IDS.includes(String(id)));
}

// === ROUTES ===

// библиотека (бренды и вкусы)
app.get("/api/library", (req, res) => {
  res.json(readJSON(libraryFile));
});
app.post("/api/library", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "not authorized" });
  writeJSON(libraryFile, req.body || []);
  res.json({ success: true });
});

// миксы
app.get("/api/mixes", (req, res) => {
  res.json(readJSON(mixesFile));
});
app.post("/api/mixes", (req, res) => {
  const data = readJSON(mixesFile);
  const newMix = req.body;
  if (!newMix || !newMix.name) return res.status(400).json({ success: false });

  newMix.id = Date.now().toString();
  newMix.likes = 0;
  data.push(newMix);
  writeJSON(mixesFile, data);
  res.json({ success: true });
});

// лайки
app.post("/api/mixes/:id/like", (req, res) => {
  const data = readJSON(mixesFile);
  const mix = data.find(m => m.id === req.params.id);
  if (!mix) return res.status(404).json({ success: false });
  mix.likes = Math.max(0, (mix.likes || 0) + (req.body.delta || 0));
  writeJSON(mixesFile, data);
  res.json({ success: true, mix });
});

// удалить микс (только админ)
app.delete("/api/mixes/:id", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "not authorized" });
  const data = readJSON(mixesFile);
  const updated = data.filter(m => String(m.id) !== String(req.params.id));
  if (updated.length === data.length)
    return res.status(404).json({ success: false, message: "Mix not found" });
  writeJSON(mixesFile, updated);
  res.json({ success: true });
});

// serve app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
});
