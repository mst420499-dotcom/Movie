const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moviestream';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    poster: { type: String, required: true },
    category: { type: String, required: true },
    contentType: { type: String, enum: ['movie', 'series'], default: 'movie' },
    views: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    videoLinks: [{ name: String, url: String }],
    episodes: [{ season: Number, episodeNumber: Number, name: String, url: String }]
}, { timestamps: true });

const Movie = mongoose.model('Movie', movieSchema);

// HOME PAGE ROUTE
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const searchQuery = req.query.search || '';
        const limit = 5;
        const skip = (page - 1) * limit;

        let query = {};
        if (searchQuery) {
            query.title = { $regex: searchQuery, $options: 'i' };
        }

        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit);

        // Recently Updated Movies
        const movies = await Movie.find(query)
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Popular Movies (Sorted by most views)
        const popularMovies = await Movie.find()
            .sort({ views: -1 })
            .limit(5);

        res.render('index', {
            movies,
            popularMovies,
            currentPage: page,
            totalPages,
            selectedCategory: null,
            searchQuery
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// CATEGORY PAGE ROUTE
app.get('/category/:categoryName', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const category = req.params.categoryName;

        const totalMovies = await Movie.countDocuments({ category });
        const totalPages = Math.ceil(totalMovies / limit);

        const movies = await Movie.find({ category })
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const popularMovies = await Movie.find()
            .sort({ views: -1 })
            .limit(5);

        res.render('index', {
            movies,
            popularMovies,
            currentPage: page,
            totalPages,
            selectedCategory: category,
            searchQuery: ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// MOVIE DETAILS PAGE
app.get('/movie/:id', async (req, res) => {
    try {
        const movie = await Movie.findByIdAndUpdate(
            req.params.id, 
            { $inc: { views: 1 } }, 
            { new: true }
        );

        if (!movie) return res.status(404).send("Movie Not Found");

        const relatedMovies = await Movie.find({ 
            category: movie.category, 
            _id: { $ne: movie._id } 
        }).limit(6);

        res.render('movie', { movie, relatedMovies });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
