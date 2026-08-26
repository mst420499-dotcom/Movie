const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Middleware Settings
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moviestream';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Mongoose Schema & Model
const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    poster: { type: String, required: true },
    category: { type: String, required: true },
    contentType: { type: String, enum: ['movie', 'series'], default: 'movie' },
    views: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    videoLinks: [{
        name: { type: String },
        url: { type: String }
    }],
    episodes: [{
        season: { type: Number, default: 1 },
        episodeNumber: { type: Number },
        name: { type: String },
        url: { type: String }
    }]
}, { timestamps: true });

const Movie = mongoose.model('Movie', movieSchema);

// ================= ROUTES ================= //

// 1. HOME PAGE ROUTE (5 items per page)
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalMovies = await Movie.countDocuments();
        const totalPages = Math.ceil(totalMovies / limit);

        const movies = await Movie.find()
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('index', {
            movies,
            currentPage: page,
            totalPages: totalPages,
            selectedCategory: null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// 2. CATEGORY PAGE ROUTE (5 items per page)
app.get('/category/:categoryName', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const category = req.params.categoryName;

        const totalMovies = await Movie.countDocuments({ category: category });
        const totalPages = Math.ceil(totalMovies / limit);

        const movies = await Movie.find({ category: category })
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('index', {
            movies,
            currentPage: page,
            totalPages: totalPages,
            selectedCategory: category
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// 3. MOVIE DETAILS & PLAYER PAGE
app.get('/movie/:id', async (req, res) => {
    try {
        const movie = await Movie.findByIdAndUpdate(
            req.params.id, 
            { $inc: { views: 1 } }, 
            { new: true }
        );

        if (!movie) {
            return res.status(404).send("Movie Not Found");
        }

        const relatedMovies = await Movie.find({ 
            category: movie.category, 
            _id: { $ne: movie._id } 
        }).limit(6);

        res.render('movie', {
            movie,
            relatedMovies
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// 4. ADMIN ADD FORM
app.get('/admin/add', (req, res) => {
    res.render('admin-add');
});

// 5. ADMIN POST API
app.post('/admin/add', async (req, res) => {
    try {
        const { title, poster, category, contentType, isPinned, videoLinks, episodes } = req.body;

        const newMovie = new Movie({
            title,
            poster,
            category,
            contentType,
            isPinned: isPinned === 'on' || isPinned === true,
            videoLinks: videoLinks || [],
            episodes: episodes || []
        });

        await newMovie.save();
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to save content");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
