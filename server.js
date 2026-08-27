const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');

const app = express();

// Middleware Setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🟢 Native Cookie Parser Middleware (নিরাপদ কুকি রিডার)
app.use((req, res, next) => {
    req.cookies = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            req.cookies[parts.shift().trim()] = decodeURIComponent(parts.join('='));
        });
    }
    next();
});

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moviestream';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Database Schemas & Models
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

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});

const adminSchema = new mongoose.Schema({
    password: { type: String, required: true }
});

const Movie = mongoose.model('Movie', movieSchema);
const Category = mongoose.model('Category', categorySchema);
const Admin = mongoose.model('Admin', adminSchema);

// Helper function to get categories
async function getCategories() {
    const cats = await Category.find().sort({ name: 1 });
    if (cats.length === 0) {
        const defaultCats = ['Bangladeshi', 'Kolkata Bangla', 'Hindi', 'Tamil', 'English', 'MCU', 'MCU WEB', 'DCU', 'Web Series', 'Natok'];
        await Category.insertMany(defaultCats.map(name => ({ name })));
        return defaultCats;
    }
    return cats.map(c => c.name);
}

// Helper to check admin password
async function checkAdminPassword(pass) {
    let admin = await Admin.findOne();
    if (!admin) {
        admin = await Admin.create({ password: 'admin' });
    }
    return admin.password === pass;
}

// ================= FRONTEND ROUTES ================= //

app.get(['/', '/category/:categoryName'], async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 12;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search ? req.query.search.trim() : '';
        const selectedCategory = req.params.categoryName || null;

        let query = {};
        if (searchQuery) query.title = { $regex: searchQuery, $options: 'i' };
        else if (selectedCategory) query.category = selectedCategory;

        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit) || 1;

        const movies = await Movie.find(query).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit);
        let popularMovies = (!selectedCategory && !searchQuery) ? await Movie.find().sort({ views: -1 }).limit(6) : [];
        const categories = await getCategories();

        res.render('index', { movies, popularMovies, categories, currentPage: page, totalPages, selectedCategory, searchQuery });
    } catch (err) {
        res.status(500).send("Internal Server Error");
    }
});

app.get('/movie/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).send("Movie not found");
        movie.views = (movie.views || 0) + 1;
        await movie.save();
        res.render('movie', { movie });
    } catch (err) {
        res.status(500).send("Internal Server Error");
    }
});

// ================= ADMIN AUTH & ROUTES ================= //

// 🟢 1. Admin Login Page
app.get('/admin/login', (req, res) => {
    if (req.cookies && req.cookies.admin_auth === 'true') {
        return res.redirect('/admin');
    }
    res.render('login', { err: req.query.err || null });
});

// 🟢 2. Login Action Process (FIXED COOKIE HEADER)
app.post('/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const isValid = await checkAdminPassword(password);
        if (isValid) {
            // কুকি সেট করার জন্য নিরাপদ ফরম্যাট
            res.setHeader('Set-Cookie', 'admin_auth=true; Path=/; SameSite=Lax');
            res.redirect('/admin');
        } else {
            res.redirect('/admin/login?err=Incorrect Password');
        }
    } catch (err) {
        res.redirect('/admin/login?err=Login Failed');
    }
});

// 🟢 3. Logout Route
app.get('/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'admin_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.redirect('/admin/login');
});

// 🟢 4. Protection Middleware (FIXED AUTH CHECK)
const isAdmin = (req, res, next) => {
    if (req.cookies && req.cookies.admin_auth === 'true') {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// 🟢 5. Admin Dashboard Render Route
app.get('/admin', isAdmin, async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        const categories = await getCategories();
        const editId = req.query.edit || null;
        let movieToEdit = editId ? await Movie.findById(editId) : null;

        res.render('admin', {
            movies,
            categories,
            movieToEdit,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    } catch (err) {
        res.status(500).send("Internal Server Error");
    }
});

app.post('/admin/save-movie', isAdmin, upload.single('posterFile'), async (req, res) => {
    try {
        const { id, title, category, contentType, posterUrl, isPinned, linkName, linkUrl, epSeason, epNum, epName, epUrl } = req.body;
        let poster = req.file ? '/uploads/' + req.file.filename : posterUrl;

        let videoLinks = [];
        if (Array.isArray(linkName)) {
            videoLinks = linkName.map((name, index) => ({ name, url: linkUrl[index] })).filter(l => l.url);
        } else if (linkName && linkUrl) {
            videoLinks.push({ name: linkName, url: linkUrl });
        }

        let episodes = [];
        if (Array.isArray(epName)) {
            episodes = epName.map((name, index) => ({
                season: Number(epSeason[index]) || 1,
                episodeNumber: Number(epNum[index]) || (index + 1),
                name,
                url: epUrl[index]
            })).filter(e => e.url);
        } else if (epName && epUrl) {
            episodes.push({ season: Number(epSeason) || 1, episodeNumber: Number(epNum) || 1, name: epName, url: epUrl });
        }

        const movieData = { title, category, contentType, isPinned: isPinned === 'on' || isPinned === true, videoLinks, episodes };
        if (poster) movieData.poster = poster;

        if (id) {
            await Movie.findByIdAndUpdate(id, movieData);
            res.redirect('/admin?msg=Content Updated Successfully');
        } else {
            if (!movieData.poster) movieData.poster = 'https://via.placeholder.com/300x450';
            await Movie.create(movieData);
            res.redirect('/admin?msg=New Content Added Successfully');
        }
    } catch (err) {
        res.redirect('/admin?err=Failed to save content');
    }
});

app.post('/admin/toggle-pin/:id', isAdmin, async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (movie) {
            movie.isPinned = !movie.isPinned;
            await movie.save();
        }
        res.redirect('/admin');
    } catch (err) {
        res.redirect('/admin?err=Action Failed');
    }
});

app.post('/admin/delete-movie/:id', isAdmin, async (req, res) => {
    try {
        await Movie.findByIdAndDelete(req.params.id);
        res.redirect('/admin?msg=Content Deleted Successfully');
    } catch (err) {
        res.redirect('/admin?err=Delete Failed');
    }
});

app.post('/admin/add-category', isAdmin, async (req, res) => {
    try {
        const { categoryName } = req.body;
        if (categoryName) await Category.create({ name: categoryName.trim() });
        res.redirect('/admin?msg=Category Added');
    } catch (err) {
        res.redirect('/admin?err=Category Exists or Invalid');
    }
});

app.post('/admin/delete-category', isAdmin, async (req, res) => {
    try {
        const { categoryName } = req.body;
        await Category.deleteOne({ name: categoryName });
        res.redirect('/admin?msg=Category Deleted');
    } catch (err) {
        res.redirect('/admin?err=Category Delete Failed');
    }
});

app.post('/admin/change-password', isAdmin, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        let admin = await Admin.findOne();
        if (!admin) admin = await Admin.create({ password: 'admin' });

        if (admin.password === oldPassword) {
            admin.password = newPassword;
            await admin.save();
            res.redirect('/admin?msg=Password Changed Successfully');
        } else {
            res.redirect('/admin?err=Incorrect Current Password');
        }
    } catch (err) {
        res.redirect('/admin?err=Password Update Failed');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
