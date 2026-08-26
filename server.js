const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

const MONGO_URI = process.env.MONGO_URI;

// 🟢 Schemas & Models
const movieSchema = new mongoose.Schema({
    title: String,
    category: String,
    poster: String,
    contentType: { type: String, default: 'movie' }, // 'movie' or 'series'
    videoLinks: [{ name: String, url: String }], // Single Movies-এর জন্য
    episodes: [{ 
        season: Number,
        episodeNumber: Number,
        name: String,
        url: String 
    }], // Web Series-এর জন্য
    isPinned: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    adminPassword: { type: String, default: "admin" },
    categories: { type: [String], default: ["Drama", "Action", "Hindi Movie", "Bangla Movie", "Thriller", "Web Series"] }
});

const Movie = mongoose.model('Movie', movieSchema);
const Settings = mongoose.model('Settings', settingsSchema);

async function getSettings() {
    let settings = await Settings.findOne();
    if (!settings) {
        settings = await Settings.create({
            adminPassword: "admin",
            categories: ["Drama", "Action", "Hindi Movie", "Bangla Movie", "Thriller", "Web Series"]
        });
    }
    return settings;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(session({
    secret: 'moviehouse_secret_key_123',
    resave: false,
    saveUninitialized: true
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ storage });

function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.redirect('/admin/login');
}

// ==================== ROUTES ====================

app.get('/', async (req, res) => {
    try {
        const settings = await getSettings();
        const selectedCategory = req.query.category || '';
        let query = {};
        if (selectedCategory) query.category = selectedCategory;

        let movies = await Movie.find(query).sort({ isPinned: -1, createdAt: -1 });
        const limit = 6;
        const page = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(movies.length / limit) || 1;
        const startIndex = (page - 1) * limit;

        res.render('index', {
            categories: settings.categories || [],
            selectedCategory,
            recentMovies: movies.slice(startIndex, startIndex + limit),
            popularMovies: await Movie.find().sort({ views: -1 }).limit(5),
            currentPage: page,
            totalPages
        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

app.get('/movie/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send('Not Found');

        movie.views = (movie.views || 0) + 1;
        await movie.save();

        const relatedMovies = await Movie.find({ _id: { $ne: movie._id }, category: movie.category }).limit(5);
        res.render('movie', { movie, relatedMovies });
    } catch (err) {
        res.status(404).send('Invalid ID');
    }
});

app.get('/admin/login', (req, res) => res.render('login', { error: null }));

app.post('/admin/login', async (req, res) => {
    const settings = await getSettings();
    if (req.body.password === settings.adminPassword) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Wrong Password!' });
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

app.get('/admin', isAdmin, async (req, res) => {
    const settings = await getSettings();
    const movies = await Movie.find().sort({ createdAt: -1 });
    const movieToEdit = req.query.edit ? await Movie.findById(req.query.edit) : null;

    res.render('admin', {
        categories: settings.categories || [],
        movies,
        movieToEdit,
        msg: req.query.msg || null,
        err: req.query.err || null
    });
});

// Add / Edit Content (Movie or Web Series)
app.post('/admin/save-movie', isAdmin, upload.single('posterFile'), async (req, res) => {
    try {
        const { id, title, category, contentType, posterUrl, linkName, linkUrl, epSeason, epNum, epName, epUrl, isPinned } = req.body;

        let poster = posterUrl || '';
        if (req.file) poster = '/uploads/' + req.file.filename;

        // Processing Movie Video Links
        const videoLinks = [];
        if (contentType === 'movie') {
            if (Array.isArray(linkUrl)) {
                linkUrl.forEach((url, i) => {
                    if (url) videoLinks.push({ name: (linkName && linkName[i]) ? linkName[i] : `Server ${i + 1}`, url });
                });
            } else if (linkUrl) {
                videoLinks.push({ name: linkName || 'Server 1', url: linkUrl });
            }
        }

        // Processing Series Episodes
        const episodes = [];
        if (contentType === 'series') {
            if (Array.isArray(epUrl)) {
                epUrl.forEach((url, i) => {
                    if (url) {
                        episodes.push({
                            season: parseInt(epSeason[i]) || 1,
                            episodeNumber: parseInt(epNum[i]) || (i + 1),
                            name: epName[i] || `Episode ${i + 1}`,
                            url
                        });
                    }
                });
            } else if (epUrl) {
                episodes.push({
                    season: parseInt(epSeason) || 1,
                    episodeNumber: parseInt(epNum) || 1,
                    name: epName || 'Episode 1',
                    url: epUrl
                });
            }
        }

        const dataToSave = {
            title,
            category,
            contentType,
            videoLinks,
            episodes,
            isPinned: isPinned === 'on'
        };
        if (poster) dataToSave.poster = poster;

        if (id) {
            await Movie.findByIdAndUpdate(id, dataToSave);
        } else {
            dataToSave.poster = poster || 'https://via.placeholder.com/300x400?text=No+Poster';
            await Movie.create(dataToSave);
        }

        res.redirect('/admin?msg=Saved+successfully!');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?err=Error+saving+content');
    }
});

app.post('/admin/delete-movie/:id', isAdmin, async (req, res) => {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
});

app.post('/admin/toggle-pin/:id', isAdmin, async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    if (movie) {
        movie.isPinned = !movie.isPinned;
        await movie.save();
    }
    res.redirect('/admin');
});

app.post('/admin/add-category', isAdmin, async (req, res) => {
    const settings = await getSettings();
    if (req.body.categoryName && !settings.categories.includes(req.body.categoryName)) {
        settings.categories.push(req.body.categoryName);
        await settings.save();
    }
    res.redirect('/admin');
});

app.post('/admin/delete-category', isAdmin, async (req, res) => {
    const settings = await getSettings();
    settings.categories = settings.categories.filter(c => c !== req.body.categoryName);
    await settings.save();
    res.redirect('/admin');
});

app.post('/admin/change-password', isAdmin, async (req, res) => {
    const settings = await getSettings();
    if (req.body.oldPassword === settings.adminPassword) {
        settings.adminPassword = req.body.newPassword;
        await settings.save();
        res.redirect('/admin?msg=Password+changed!');
    } else {
        res.redirect('/admin?err=Wrong+old+password!');
    }
});

const startServer = async () => {
    try {
        if (!MONGO_URI) {
            console.error('❌ MONGO_URI missing!');
        } else {
            await mongoose.connect(MONGO_URI);
            console.log('🟢 MongoDB Connected!');
            await getSettings();
        }
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    } catch (err) {
        console.error('❌ Server startup error:', err);
    }
};

startServer();
