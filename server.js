// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const dataDir = path.join(__dirname, "data");
const libraryFile = path.join(dataDir, "library.json");
const mixesFile = path.join(dataDir, "mixes.json");

// === Helper functions ===
function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// === ROUTES ===

// get all brands & flavors
app.get("/api/library", (req, res) => {
  const data = readJSON(libraryFile);
  res.json(data);
});

// update library (admin)
app.post("/api/library", (req, res) => {
  const data = req.body;
  if (!Array.isArray(data))
    return res.status(400).json({ success: false, message: "Invalid data" });
  writeJSON(libraryFile, data);
  res.json({ success: true });
});

// get all mixes
app.get("/api/mixes", (req, res) => {
  const data = readJSON(mixesFile);
  res.json(data);
});

// add new mix
app.post("/api/mixes", (req, res) => {
  const data = readJSON(mixesFile);
  const mix = req.body;
  if (!mix || !mix.name || !mix.flavors)
    return res.status(400).json({ success: false, message: "Invalid mix data" });

  mix.id = Date.now();
  mix.likes = 0;
  data.push(mix);
  writeJSON(mixesFile, data);
  res.json({ success: true, mix });
});

// like/unlike mix
app.post("/api/mixes/:id/like", (req, res) => {
  const { id } = req.params;
  const { delta } = req.body;
  const data = readJSON(mixesFile);
  const idx = data.findIndex((m) => String(m.id) === String(id));
  if (idx === -1) return res.json({ success: false, message: "Mix not found" });

  data[idx].likes = Math.max(0, (data[idx].likes || 0) + (delta || 0));
  writeJSON(mixesFile, data);
  res.json({ success: true, mix: data[idx] });
});

// === fallback to index.html ===
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
