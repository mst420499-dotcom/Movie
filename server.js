const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');

const app = express();

// Body Parser & Static Files Setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Setup for File Uploads
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

// Schemas & Models
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

// Helper function to fetch categories
async function getCategories() {
    const cats = await Category.find().sort({ name: 1 });
    if (cats.length === 0) {
        const defaultCats = ['Bangladeshi', 'Kolkata Bangla', 'Hindi', 'Tamil', 'English', 'MCU', 'MCU WEB', 'DCU', 'Web Series', 'Natok'];
        await Category.insertMany(defaultCats.map(name => ({ name })));
        return defaultCats;
    }
    return cats.map(c => c.name);
}

// ================= FRONTEND ROUTES ================= //

// 🟢 Homepage Route (Category Filter + Pagination Fixed)
app.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 12;
        const skip = (page - 1) * limit;
        const selectedCategory = req.query.category ? req.query.category.trim() : null;

        let query = {};
        if (selectedCategory && selectedCategory !== 'All') {
            query.category = selectedCategory;
        }

        const totalMovies = await Movie.countDocuments(query);
        const totalPages = Math.ceil(totalMovies / limit) || 1;

        const movies = await Movie.find(query)
            .sort({ isPinned: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const categories = await getCategories();

        res.render('index', { 
            movies, 
            categories, 
            currentPage: page, 
            totalPages,
            selectedCategory: selectedCategory || 'All'
        });
    } catch (err) {
        console.error("Homepage Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// 🟢 Single Movie / Series Details Route
app.get('/movie/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) {
            return res.status(404).send("Movie not found");
        }
        movie.views = (movie.views || 0) + 1;
        await movie.save();
        res.render('movie', { movie });
    } catch (err) {
        console.error("Movie Details Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ================= ADMIN ROUTES ================= //

// 🟢 Admin Panel Dashboard
app.get('/admin', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        const categories = await getCategories();
        const editId = req.query.edit || null;
        let movieToEdit = null;

        if (editId) {
            movieToEdit = await Movie.findById(editId);
        }

        res.render('admin', {
            movies,
            categories,
            movieToEdit,
            msg: req.query.msg || null,
            err: req.query.err || null
        });
    } catch (err) {
        console.error("Admin Dashboard Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// 🟢 Save Content (Add & Edit)
app.post('/admin/save-movie', upload.single('posterFile'), async (req, res) => {
    try {
        const { id, title, category, contentType, posterUrl, isPinned, linkName, linkUrl, epSeason, epNum, epName, epUrl } = req.body;

        let poster = posterUrl;
        if (req.file) {
            poster = '/uploads/' + req.file.filename;
        }

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
            episodes.push({
                season: Number(epSeason) || 1,
                episodeNumber: Number(epNum) || 1,
                name: epName,
                url: epUrl
            });
        }

        const movieData = {
            title,
            category,
            contentType,
            isPinned: isPinned === 'on' || isPinned === true,
            videoLinks,
            episodes
        };

        if (poster) movieData.poster = poster;

        if (id) {
            await Movie.findByIdAndUpdate(id, movieData);
            res.redirect('/admin?msg=Content Updated Successfully');
        } else {
            if (!movieData.poster) movieData.poster = 'https://via.placeholder.com/300x450';
            const newMovie = new Movie(movieData);
            await newMovie.save();
            res.redirect('/admin?msg=New Content Added Successfully');
        }
    } catch (err) {
        console.error("Save Content Error:", err);
        res.redirect('/admin?err=Failed to save content');
    }
});

// 🟢 Toggle Pin/Unpin
app.post('/admin/toggle-pin/:id', async (req, res) => {
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

// 🟢 Delete Content
app.post('/admin/delete-movie/:id', async (req, res) => {
    try {
        await Movie.findByIdAndDelete(req.params.id);
        res.redirect('/admin?msg=Content Deleted Successfully');
    } catch (err) {
        res.redirect('/admin?err=Delete Failed');
    }
});

// 🟢 Add Category
app.post('/admin/add-category', async (req, res) => {
    try {
        const { categoryName } = req.body;
        if (categoryName) {
            await Category.create({ name: categoryName.trim() });
        }
        res.redirect('/admin?msg=Category Added');
    } catch (err) {
        res.redirect('/admin?err=Category Exists or Invalid');
    }
});

// 🟢 Delete Category
app.post('/admin/delete-category', async (req, res) => {
    try {
        const { categoryName } = req.body;
        await Category.deleteOne({ name: categoryName });
        res.redirect('/admin?msg=Category Deleted');
    } catch (err) {
        res.redirect('/admin?err=Category Delete Failed');
    }
});

// 🟢 Change Password
app.post('/admin/change-password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        let admin = await Admin.findOne();
        if (!admin) {
            admin = await Admin.create({ password: 'admin' });
        }
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

// Logout
app.get('/admin/logout', (req, res) => {
    res.redirect('/');
});

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
