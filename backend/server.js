const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';

const sanitizeFilename = (filename) => {
  const fallback = 'note';
  return path
    .basename(filename || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .trim() || fallback;
};

// Middleware
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database setup
const db = new sqlite3.Database('./notes.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    file_path TEXT,
    original_name TEXT,
    mime_type TEXT,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run('ALTER TABLE notes ADD COLUMN original_name TEXT', () => {});
  db.run('ALTER TABLE notes ADD COLUMN mime_type TEXT', () => {});
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
    if (err) {
      return res.status(400).json({ error: 'User already exists' });
    }
    res.json({ message: 'User registered' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id }, SECRET_KEY);
    res.json({ token });
  });
});

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'No token provided' });
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
};

app.get('/notes', verifyToken, (req, res) => {
  db.all('SELECT * FROM notes WHERE user_id = ?', [req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/notes', verifyToken, upload.single('file'), (req, res) => {
  const { title, content } = req.body;
  const filePath = req.file ? req.file.path : null;
  const originalName = req.file ? sanitizeFilename(req.file.originalname) : null;
  const mimeType = req.file ? req.file.mimetype : null;
  db.run(
    'INSERT INTO notes (title, content, file_path, original_name, mime_type, user_id) VALUES (?, ?, ?, ?, ?, ?)',
    [title, content, filePath, originalName, mimeType, req.userId],
    function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
    }
  );
});

app.get('/notes/:id/download', verifyToken, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, req.userId], (err, note) => {
    if (err || !note) return res.status(404).json({ error: 'Note not found' });
    if (note.file_path) {
      const filePath = path.resolve(__dirname, note.file_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
      }

      const extension = path.extname(filePath);
      const fallbackName = `${sanitizeFilename(note.title || 'note')}${extension}`;
      const downloadName = sanitizeFilename(note.original_name || fallbackName);
      if (note.mime_type) {
        res.type(note.mime_type);
      }
      res.download(filePath, downloadName);
    } else {
      const safeTitle = sanitizeFilename(note.title || 'note');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
      res.setHeader('Content-Type', 'text/plain');
      res.send(note.content);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
