const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key';
const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
const TEACHER_USERNAME = (process.env.TEACHER_USERNAME || 'mr alok').trim().toLowerCase();

if (!MONGODB_URI || MONGODB_URI === 'your_mongodb_atlas_connection_string_here') {
  console.error('MONGODB_URI is missing. Add your real MongoDB Atlas connection string in backend/.env.');
  process.exit(1);
}

if (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://')) {
  console.error('MONGODB_URI is invalid. It must start with mongodb:// or mongodb+srv://');
  console.error('Example: MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/my-notes?retryWrites=true&w=majority');
  process.exit(1);
}

const sanitizeFilename = (filename) => {
  const fallback = 'note';
  return path
    .basename(filename || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .trim() || fallback;
};

const normalizeNote = (note) => ({
  id: note._id.toString(),
  title: note.title,
  content: note.content,
  file_path: note.filePath,
  original_name: note.originalName,
  mime_type: note.mimeType,
  createdAt: note.createdAt,
});

const isTeacher = (username) => username?.trim().toLowerCase() === TEACHER_USERNAME;

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    filePath: { type: String, default: null },
    originalName: { type: String, default: null },
    mimeType: { type: String, default: null },
    fileData: { type: Buffer, default: null, select: false },
    fileSize: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Note = mongoose.model('Note', noteSchema);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword });
    res.json({ message: 'User registered' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id.toString(), username: user.username }, SECRET_KEY);
    res.json({ token, username: user.username, role: isTeacher(user.username) ? 'teacher' : 'student' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    req.username = decoded.username;
    req.isTeacher = isTeacher(decoded.username);
    next();
  });
};

const requireTeacher = async (req, res, next) => {
  if (req.isTeacher) return next();

  try {
    const user = await User.findById(req.userId);
    if (isTeacher(user?.username)) {
      req.username = user.username;
      req.isTeacher = true;
      return next();
    }
  } catch (err) {
    return res.status(500).json({ error: 'Permission check failed' });
  }

  return res.status(403).json({ error: 'Only teacher can manage notes' });
};

app.get('/notes', verifyToken, async (req, res) => {
  try {
    const notes = await Note.find({}).sort({ createdAt: 1 });
    res.json(notes.map(normalizeNote));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.post('/notes', verifyToken, requireTeacher, upload.single('file'), async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const note = await Note.create({
      title,
      content,
      filePath: null,
      originalName: req.file ? sanitizeFilename(req.file.originalname) : null,
      mimeType: req.file ? req.file.mimetype : null,
      fileData: req.file ? req.file.buffer : null,
      fileSize: req.file ? req.file.size : 0,
      userId: req.userId,
    });

    res.json({ id: note._id.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

app.get('/notes/:id/download', verifyToken, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id).select('+fileData');
    if (!note) return res.status(404).json({ error: 'Note not found' });

    if (note.fileData) {
      const extension = path.extname(note.originalName || '');
      const fallbackName = `${sanitizeFilename(note.title || 'note')}${extension}`;
      const downloadName = sanitizeFilename(note.originalName || fallbackName);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', note.mimeType || 'application/octet-stream');
      return res.send(note.fileData);
    }

    if (note.filePath) {
      const filePath = path.resolve(__dirname, note.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
      }

      const extension = path.extname(filePath);
      const fallbackName = `${sanitizeFilename(note.title || 'note')}${extension}`;
      const downloadName = sanitizeFilename(note.originalName || fallbackName);
      if (note.mimeType) {
        res.type(note.mimeType);
      }
      return res.download(filePath, downloadName);
    }

    const safeTitle = sanitizeFilename(note.title || 'note');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.txt"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(note.content);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

app.delete('/notes/:id', verifyToken, requireTeacher, async (req, res) => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

const startServer = async () => {
  try {
    dns.setDefaultResultOrder('ipv4first');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('Connected to MongoDB Atlas.');
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Backend is probably already running.`);
        console.error(`Open http://localhost:${PORT}/health to verify the running server.`);
        process.exit(1);
      }
      throw err;
    });
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error('Check Atlas Network Access and add your current IP or 0.0.0.0/0 while testing.');
    process.exit(1);
  }
};

startServer();
