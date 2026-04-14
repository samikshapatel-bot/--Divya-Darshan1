const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const session = require('express-session');

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'divya-darshan-secret',
    resave: false,
    saveUninitialized: false
}));

/* =========================
   MONGODB CONNECTION
========================= */
mongoose.connect('mongodb://127.0.0.1:27017/divya-darshan')
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ DB Error:", err));

/* =========================
   SCHEMAS
========================= */

// ✅ UPDATED USER SCHEMA
const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    phone: String,
    age: Number,
    gender: String
}));

const Booking = mongoose.model('Booking', new mongoose.Schema({
    userEmail: String,
    temple: String,
    date: String,
    slot: String,
    bookingDate: { type: Date, default: Date.now }
}));

/* =========================
   TEMPLE DATA (MINIMAL)
========================= */

const templesData = {
    somnath: { name: "Somnath", location: "Gujarat" },
    mahakaleshwar: { name: "Mahakaleshwar", location: "Ujjain" },
    kedarnath: { name: "Kedarnath", location: "Uttarakhand" },
    kashi: { name: "Kashi Vishwanath", location: "Varanasi" },
    rameshwaram: { name: "Rameshwaram", location: "Tamil Nadu" }
};

/* =========================
   AUTH MIDDLEWARE
========================= */
function requireLogin(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

/* =========================
   ROUTES
========================= */

// HOME
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null, templesData });
});

// SIGNUP PAGE
app.get('/signup', (req, res) =>
    res.render('signup', { user: null, error: null })
);

// LOGIN PAGE
app.get('/login', (req, res) => {
    res.render('login', { user: null });
});

// BOOK PAGE
app.get('/book', requireLogin, (req, res) => {
    res.render('book', { user: req.session.user, templesData });
});

// EXPLORE
app.get('/explore', (req, res) => {
    res.render('explore', { user: req.session.user || null, templesData });
});
// CONTACT FORM
app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;

    console.log("New Message:", name, email, message);

    res.send("Message Sent Successfully 🙏");
});

/* =========================
   AUTH LOGIC
========================= */

// SIGNUP
app.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone, age, gender } = req.body;

        if (!name || !email || !password || !phone || !age || !gender) {
            return res.render('signup', { error: "All fields required" });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.render('signup', { error: "User already exists" });
        }

        const user = new User({ name, email, password, phone, age, gender });
        await user.save();

        res.redirect('/login');

    } catch (err) {
        res.render('signup', { error: "Signup failed" });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({
            email: req.body.email,
            password: req.body.password
        });

        if (!user) return res.send("Invalid credentials");

        req.session.user = {
            name: user.name,
            email: user.email
        };

        res.redirect('/book');

    } catch (err) {
        res.status(500).send("Login error");
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

/* =========================
   BOOKING FLOW
========================= */

app.post('/checkout', requireLogin, (req, res) => {
    const { temple, date, slot } = req.body;

    if (!temple || !date || !slot) {
        return res.send("Missing booking data");
    }

    const amount = 501; // ✅ fixed

    res.render('checkout', {
        temple,
        date,
        slot,
        amount,
        user: req.session.user
    });
});
// CONFIRM BOOKING
app.post('/confirm', requireLogin, async (req, res) => {
    try {
        const { temple, date, slot } = req.body;
        const email = req.session.user.email;

        // ✅ booking create
        const newBooking = new Booking({
            userEmail: email,
            temple,
            date,
            slot
        });

        // ✅ DB me save
        await newBooking.save();

        // ✅ confirmation page
        res.render('confirmation', {
            temple,
            date,
            slot,
            user: req.session.user
        });

    } catch (err) {
        res.status(500).send("Booking error");
    }
});
// HISTORY
app.get('/history', requireLogin, async (req, res) => {
    try {
        const bookings = await Booking.find({
            userEmail: req.session.user.email
        }).sort({ bookingDate: -1 });

        res.render('history', {
            bookings,
            user: req.session.user
        });

    } catch (err) {
        res.status(500).send("History error");
    }
});

/* =========================
   PDF RECEIPT
========================= */

app.post('/download-receipt', (req, res) => {
    const { temple, date, slot } = req.body;

    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Darshan_Receipt.pdf');

    doc.rect(0, 0, 612, 100).fill('#081A39');

    doc.fillColor('#FFD700')
        .fontSize(25)
        .text('DIVYA DARSHAN', 50, 40);

    doc.fillColor('black')
        .fontSize(18)
        .text('Booking Receipt', 50, 120);

    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Temple: ${temple}`);
    doc.text(`Date: ${date}`);
    doc.text(`Slot: ${slot}`);
    doc.text(`Status: CONFIRMED`);

    doc.moveDown(3);
    doc.text('Carry valid ID proof', { align: 'center' });

    doc.pipe(res);
    doc.end();
});

/* =========================
   ADMIN PANEL
========================= */

app.get('/admin-dashboard', async (req, res) => {
    try {
        const users = await User.find({});
        const bookings = await Booking.find({});

        res.render('admin', {
            users,
            bookings,
            user: req.session.user || null
        });

    } catch (err) {
        res.status(500).send("Admin error");
    }
});

/* =========================
   SERVER START
========================= */

app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});