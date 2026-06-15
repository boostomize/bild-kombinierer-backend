const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app      = express();
const PORT     = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// uploads/ Ordner anlegen falls nicht vorhanden
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// CORS: nur erlaubte Origins durchlassen
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Kein Origin = direkte Anfrage (z.B. curl, Postman) → erlauben
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: Origin nicht erlaubt — ' + origin));
  }
}));

// Multer Storage: eindeutiger Dateiname per UUID
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function (req, file, cb) {
    const unique = crypto.randomUUID();
    cb(null, unique + '.png');
  }
});

// Multer Upload: max 20 MB, nur Bilder
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Nur Bilddateien erlaubt'));
    }
    cb(null, true);
  }
});

// ─── Routen ────────────────────────────────────────────────────────────────

// Health Check — Railway prüft ob der Server läuft
app.get('/health', function (req, res) {
  res.json({ ok: true, time: new Date().toISOString() });
});

// POST /upload — nimmt ein Bild entgegen, speichert es, gibt URL zurück
app.post('/upload', upload.single('image'), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Kein Bild empfangen' });
  }

  const publicUrl = BASE_URL + '/image/' + req.file.filename;

  // Datei nach 1 Stunde automatisch löschen
  setTimeout(function () {
    fs.unlink(req.file.path, function () {});
  }, 60 * 60 * 1000);

  console.log('Upload gespeichert:', req.file.filename);
  res.json({ url: publicUrl });
});

// GET /image/:filename — liefert das Bild öffentlich aus
app.get('/image/:filename', function (req, res) {
  // Sicherheit: path traversal verhindern
  const filename = path.basename(req.params.filename);
  const filepath = path.join(uploadDir, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Bild nicht gefunden oder bereits gelöscht' });
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(filepath);
});

// ─── Server starten ─────────────────────────────────────────────────────────

app.listen(PORT, function () {
  console.log('Server läuft auf Port ' + PORT);
  console.log('BASE_URL:', BASE_URL);
  console.log('Erlaubte Origins:', allowedOrigins.length ? allowedOrigins : 'alle (kein Filter)');
});
