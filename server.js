const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/book-store';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB successfully connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.get('/', (req, res) => {
  res.send('Book Store Server is running...');
});

// Admin Route (Added to fix "Cannot GET /admin")
app.get('/admin', (req, res) => {
  res.send('Welcome to the Admin Dashboard API');
});

// Server Listening
app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
