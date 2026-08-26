const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Files (CSS / Uploads)
app.use(express.static(path.join(__dirname, 'views')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB successfully connected'))
    .catch((err) => console.error('MongoDB connection error:', err));
}

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Routes for EJS Templates

// 1. Home Page (index.ejs)
app.get('/', (req, res) => {
  res.render('index', { title: 'Home Page' });
});

// 2. Admin Page (admin.ejs)
app.get('/admin', (req, res) => {
  res.render('admin', { title: 'Admin Dashboard' });
});

// 3. Login Page (login.ejs)
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

// 4. Movie Page (movie.ejs)
app.get('/movie', (req, res) => {
  res.render('movie', { title: 'Movie Details' });
});

// 5. Search Page (search.ejs)
app.get('/search', (req, res) => {
  res.render('search', { title: 'Search Movies' });
});

// Server Listening
app.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
