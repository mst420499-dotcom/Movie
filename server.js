// Server Start (MongoDB কানেক্ট হওয়ার পর সার্ভার চালু হবে)
const startServer = async () => {
    try {
        if (!MONGO_URI) {
            console.error('❌ CRITICAL ERROR: MONGO_URI Environment Variable is missing in Render!');
        } else {
            await mongoose.connect(MONGO_URI);
            console.log('🟢 MongoDB Connected Successfully!');
            await getSettings(); // ইনিশিয়াল সেটিংস নিশ্চিত করবে
        }

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Database/Server Startup Error:', err);
    }
};

startServer();
