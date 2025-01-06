const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');



const loadlogin = (req,res) =>{
    if(req.session.admin){
        return res.redirect('/admin/dashboard');
    }
    res.render("admin-login",{message:null})
}
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login request received with email:', email);

        const admin = await User.findOne({ email, isAdmin: true });
        console.log('Admin found:', admin);

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            console.log('Password match:', passwordMatch);

            if (passwordMatch) {
                req.session.admin = true;
                console.log('Session set:', req.session);
                return res.redirect('/admin/dashboard');
            } else {
                console.log('Invalid password');
                return res.render('admin-login', { message: 'Invalid credentials' });
            }
        } else {
            console.log('Admin not found');
            return res.render('admin-login', { message: 'User not found' });
        }
    } catch (error) {
        console.log('Login error:', error);
        return res.redirect('/pageerror');
    }
};


const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            console.log('Rendering dashboard for admin');
            res.render("dashboard");
        } catch (error) {
            console.log('Dashboard error:', error);
            return res.redirect("/pageerror");
        }
    } else {
        console.log('Admin session not found, redirecting to login');
        return res.redirect('/admin-login');
    }
};



module.exports ={
    loadlogin,
    login,
    loadDashboard
}
