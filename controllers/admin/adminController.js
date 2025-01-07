const User = require("../../models/userSchema");
const bcrypt = require('bcrypt')

const loadlogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');  // Redirect to admin dashboard if already logged in
    }
    res.render("admin-login", { message: null });
};

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
                return res.redirect('/admin/dashboard');  // Corrected redirection to /admin/dashboard
            }
            
        } else {
            return res.redirect('/admin/login');  // Redirect to login if no admin found
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
            res.render("dashboard");  // Ensure you have a dashboard.ejs file
        } catch (error) {
            console.log('Dashboard error:', error);
            return res.redirect("/pageerror");
        }
    } else {
        console.log('Admin session not found, redirecting to login');
        return res.redirect('/admin/login');
    }
};
 const pageerror = async (req,res)=>{
    res.render("admin-error")
 }

 //logout
 const logout = async(req,res)=>{
     try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroyed session",err);
                return res.redirect('/pageerror')
                
            }
          res.redirect('/admin/login')
        })
     } catch (error) {
         console.log("unexpected error during logout",error);
         res.redirect("/pageerror")
     }
 }


module.exports = {
    loadlogin,
    login,
    loadDashboard,
    pageerror,
    logout
};
