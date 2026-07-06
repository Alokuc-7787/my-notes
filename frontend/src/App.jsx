import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaArrowRight,
  FaBookOpen,
  FaCloudUploadAlt,
  FaTrash,
  FaDownload,
  FaFileAlt,
  FaLock,
  FaSignOutAlt,
  FaUserGraduate,
} from 'react-icons/fa';
import axios from 'axios';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL;
const TEACHER_USERNAME = (import.meta.env.VITE_TEACHER_USERNAME || 'mr alok').trim().toLowerCase();

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const getFilenameFromDisposition = (disposition, fallback) => {
  const utfFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfFilename?.[1]) {
    return decodeURIComponent(utfFilename[1].replace(/"/g, ''));
  }

  const regularFilename = disposition.match(/filename="?([^";]+)"?/i);
  return regularFilename?.[1] || fallback;
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [studentName, setStudentName] = useState(localStorage.getItem('studentName') || '');
  const [notes, setNotes] = useState([]);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', password: '' });
  const [isRegister, setIsRegister] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', file: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isTeacher = studentName.trim().toLowerCase() === TEACHER_USERNAME;

  useEffect(() => {
    if (token) {
      fetchNotes();
    }
  }, [token]);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${API_BASE}/notes`, {
        headers: { Authorization: token },
      });
      setNotes(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const sortedNotes = useMemo(() => [...notes].reverse(), [notes]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await axios.post(`${API_BASE}/login`, loginData);
      setToken(res.data.token);
      const username = res.data.username || loginData.username;
      setStudentName(username);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('studentName', username);
    } catch (err) {
      alert('Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await axios.post(`${API_BASE}/register`, registerData);
      alert('Registered successfully');
      setLoginData({ username: registerData.username, password: '' });
      setRegisterData({ username: '', password: '' });
      setIsRegister(false);
    } catch (err) {
      alert('Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async (event) => {
    event.preventDefault();
    if (!isTeacher) {
      alert('Only teacher can upload notes');
      return;
    }

    const formData = new FormData();
    formData.append('title', newNote.title);
    formData.append('content', newNote.content);
    if (newNote.file) formData.append('file', newNote.file);

    try {
      await axios.post(`${API_BASE}/notes`, formData, {
        headers: { Authorization: token, 'Content-Type': 'multipart/form-data' },
      });
      fetchNotes();
      setNewNote({ title: '', content: '', file: null });
      event.target.reset();
    } catch (err) {
      alert('Failed to add note');
    }
  };

  const handleDownload = async (note) => {
    try {
      const response = await axios.get(`${API_BASE}/notes/${note.id}/download`, {
        headers: { Authorization: token },
        responseType: 'blob',
      });
      const disposition = response.headers['content-disposition'] || '';
      const fallbackExtension = note.file_path ? note.file_path.split('.').pop() : 'txt';
      const fallbackName = `${note.title || 'note'}.${fallbackExtension}`;
      const filename = getFilenameFromDisposition(disposition, fallbackName);
      const fileUrl = URL.createObjectURL(response.data);
      const downloadLink = document.createElement('a');
      downloadLink.href = fileUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(fileUrl);
    } catch (err) {
      alert('Download failed. Please login again and try.');
    }
  };

  const handleDeleteNote = async (note) => {
    if (!window.confirm(`Delete "${note.title}"?`)) return;

    try {
      await axios.delete(`${API_BASE}/notes/${note.id}`, {
        headers: { Authorization: token },
      });
      fetchNotes();
    } catch (err) {
      alert('Only teacher can delete notes');
    }
  };

  const logout = () => {
    setToken(null);
    setStudentName('');
    localStorage.removeItem('token');
    localStorage.removeItem('studentName');
  };

  if (!token) {
    const activeData = isRegister ? registerData : loginData;
    const setActiveData = isRegister ? setRegisterData : setLoginData;

    return (
      <main className="auth-page">
        <div className="animated-grid" />
        <motion.section
          className="auth-shell"
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <motion.div
            className="auth-badge"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <FaBookOpen /> Digital Notes Portal
          </motion.div>

          <div className="auth-card">
            <div className="auth-icon">
              {isRegister ? <FaBookOpen /> : <FaUserGraduate />}
            </div>
            <h1>{isRegister ? 'Create Student Account' : 'Student Login'}</h1>
            <p>Access uploaded notes, class files and study material in one clean dashboard.</p>

            <form onSubmit={isRegister ? handleRegister : handleLogin}>
              <label>
                Student Name
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={activeData.username}
                  onChange={(event) => setActiveData({ ...activeData, username: event.target.value })}
                  required
                />
              </label>

              <label>
                User ID
                <input
                  type="password"
                  placeholder="Enter your User ID"
                  value={activeData.password}
                  onChange={(event) => setActiveData({ ...activeData, password: event.target.value })}
                  required
                />
              </label>

              <motion.button className="primary-button" type="submit" whileTap={{ scale: 0.98 }} disabled={isSubmitting}>
                <FaLock />
                {isSubmitting ? 'Please wait...' : isRegister ? 'Register' : 'Login'}
                <FaArrowRight />
              </motion.button>
            </form>

            <button className="ghost-button" type="button" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? 'Already have an account? Login' : 'New student? Register here'}
            </button>
          </div>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-glow" />

      <header className="dashboard-header">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="section-kicker">Student Dashboard</span>
          <h1>Welcome, {studentName || 'Student'}</h1>
          <p>Explore all uploaded notes below</p>
        </motion.div>
        <button className="logout-button" onClick={logout} type="button">
          <FaSignOutAlt /> Logout
        </button>
      </header>

      {isTeacher && (
        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleAddNote}
          className="upload-panel"
        >
          <div>
            <span className="section-kicker">Upload Notes</span>
            <h2>Add new study material</h2>
          </div>
          <input
            type="text"
            placeholder="Note title"
            value={newNote.title}
            onChange={(event) => setNewNote({ ...newNote, title: event.target.value })}
            required
          />
          <textarea
            placeholder="Short description or written note"
            value={newNote.content}
            onChange={(event) => setNewNote({ ...newNote, content: event.target.value })}
          />
          <label className="file-picker">
            <FaCloudUploadAlt />
            <span>{newNote.file ? newNote.file.name : 'Attach PDF, DOCX or image'}</span>
            <input
              type="file"
              onChange={(event) => setNewNote({ ...newNote, file: event.target.files[0] })}
            />
          </label>
          <button className="primary-button compact" type="submit">
            <FaCloudUploadAlt /> Add Note
          </button>
        </motion.form>
      )}

      <AnimatePresence mode="popLayout">
        {sortedNotes.length > 0 ? (
          <motion.section
            className="notes-grid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {sortedNotes.map((note, index) => (
              <motion.article
                key={note.id}
                className="note-card"
                variants={itemVariants}
                whileHover={{ y: -8, scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <div className="note-topline">
                  <span className="note-icon"><FaFileAlt /></span>
                  <span>Note #{sortedNotes.length - index}</span>
                </div>
                <h3>{note.title}</h3>
                <p>{note.content || 'No description added yet.'}</p>
                <div className="note-actions">
                  <button type="button" onClick={() => handleDownload(note)}>
                    <FaDownload /> Download
                  </button>
                  {isTeacher && (
                    <button className="delete-button" type="button" onClick={() => handleDeleteNote(note)}>
                      <FaTrash /> Delete
                    </button>
                  )}
                </div>
              </motion.article>
            ))}
          </motion.section>
        ) : (
          <motion.section className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <FaBookOpen />
            <h2>No notes uploaded yet</h2>
            <p>Add your first note from the upload panel above.</p>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
