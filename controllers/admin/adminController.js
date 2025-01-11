const User = require("../../models/userSchema");
const bcrypt = require('bcrypt')

const loadlogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');  
    }
    res.render("admin-login",{message:req.flash('err')});
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if(!email,!password){
            req.flash('err','Please enter the email and password!')
           return res.redirect('/admin/login')
        }
    

        const admin = await User.findOne({ email, isAdmin: true });
        // console.log('admin found:', admin);
                
        if(!admin){
            req.flash('err','Invalid admin!');
            return res.redirect('/admin/login')
        }

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            console.log('Password match:', passwordMatch);
        

            if (!passwordMatch) {
               req.flash('err','Invalid Password!')
               return res.redirect('/admin/login')
               
            }else{
                req.session.admin = true;
                return res.redirect('/admin/dashboard');  
            }
            
        } else {
            return res.redirect('/admin/login'); 
        }
    } catch (error) {
        console.log('Login error:', error);
        return res.redirect('/pageerror');
    }
};

const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            res.render("dashboard");  
        } catch (error) {
            console.log('Dashboard error:', error);
            return res.redirect("/pageerror");
        }
    } else {
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
