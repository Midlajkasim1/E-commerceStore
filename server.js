const express = require('express');
const app = express();
const env = require('dotenv');
env.config();
const session = require('express-session');
const passport = require('./config/passport');
const flash = require('connect-flash');
const nocache = require('nocache');
const path = require('path');
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRouter');
const adminRoutes = require('./routes/adminRouter');



app.use(session({
   secret: process.env.SESSION_SECRET  || 'defaultSecret',
   resave: false,
   saveUninitialized: true,
   cookie: { secure: false, httpOnly: true, maxAge: 48 * 60 * 60 * 1000 } 
}));
app.use(flash());
app.use(nocache());
//
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
});

connectDB(); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')]);
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', userRoutes);
app.use('/admin',adminRoutes)

const HOST = 'http://localhost';

app.listen(process.env.PORT, () => console.log(`Server is running at ${HOST}:${process.env.PORT}`));

module.exports = app;
