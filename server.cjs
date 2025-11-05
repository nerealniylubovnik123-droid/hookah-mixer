// === Hookah Mixer App Server ===
// CommonJS версия — устойчива в Railway и создаёт файлы автоматически

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

// === Настройки окружения ===
const ADMIN_TG_IDS = (process.env.ADMIN_TG_IDS || "504348666,2015942051")
  .split(",")
  .map(s => s.trim());
const DEV_ALLOW_UNSAFE = process.env.DEV_ALLOW_UNSAFE === "true";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

// === Убедиться, что папка и файлы существуют ===
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const libraryFile = path.join(DATA_DIR, "library.json");
const mixesFile = path.join(DATA_DIR, "mixes.json");

if (!fs.existsSync(libraryFile)) fs.writeFileSync(libraryFile, "[]");
if (!fs.existsSync(mixesFile)) fs.writeFileSync(mixesFile, "[]");

// === Вспомогательные функции ===
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf-8") || "[]");
  } catch (e) {
    console.error("Ошибка чтения JSON:", e);
    return [];
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Ошибка записи JSON:", e);
  }
}

function isAdmin(req) {
  const id = req.header("x-admin-id");
  return DEV_ALLOW_UNSAFE || (id && ADMIN_TG_IDS.includes(String(id)));
}

// === Middleware ===
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// === ROUTES ===

// Получение библиотеки вкусов
app.get("/api/library", (req, res) => {
  res.json(readJSON(libraryFile));
});

// Обновление библиотеки (только админ)
app.post("/api/library", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "not authorized" });
  writeJSON(libraryFile, req.body || []);
  res.json({ success: true });
});

// Получение миксов
app.get("/api/mixes", (req, res) => {
  res.json(readJSON(mixesFile));
});

// Добавление микса
app.post("/api/mixes", (req, res) => {
  const data = readJSON(mixesFile);
  const newMix = req.body;
  if (!newMix || !newMix.name)
    return res.status(400).json({ success: false, message: "Invalid mix" });

  newMix.id = Date.now().toString();
  newMix.likes = 0;
  data.push(newMix);
  writeJSON(mixesFile, data);
  res.json({ success: true });
});

// Лайк / дизлайк микса
app.post("/api/mixes/:id/like", (req, res) => {
  const data = readJSON(mixesFile);
  const mix = data.find(m => m.id === req.params.id);
  if (!mix) return res.status(404).json({ success: false });
  mix.likes = Math.max(0, (mix.likes || 0) + (req.body.delta || 0));
  writeJSON(mixesFile, data);
  res.json({ success: true, mix });
});

// Удаление микса (только админ)
app.delete("/api/mixes/:id", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "not authorized" });
  const data = readJSON(mixesFile);
  const updated = data.filter(m => String(m.id) !== String(req.params.id));
  if (updated.length === data.length)
    return res.status(404).json({ success: false, message: "Mix not found" });

  writeJSON(mixesFile, updated);
  res.json({ success: true });
});

// === Бэкапы ===
app.get("/api/download/library", (req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=library_backup.json");
  res.setHeader("Content-Type", "application/json");
  res.send(readJSON(libraryFile));
});

app.get("/api/download/mixes", (req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=mixes_backup.json");
  res.setHeader("Content-Type", "application/json");
  res.send(readJSON(mixesFile));
});

// === Фронтенд ===
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === Запуск ===
app.listen(PORT, () => {
  console.log(`✅ Server started on port ${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
});
