const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();



// Load Signup Page
const loadSignup = async (req, res) => {
    try {
        if(req.session){
        res.render('signup',{message:req.flash('err')});
    }
    } catch (error) {
        console.error("Error loading signup page:", error);
        res.status(500).send("Server error");
    }
};

// OTP Generator
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); 
}


// email verification 
async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 465,  
            secure: true,  
            requireTLS: true,  
            auth: {
                user: process.env.NODEMAILER_EMAIL,  
                pass: process.env.NODEMAILER_PASSWORD, 
            },
        });

        const info = await transporter.sendMail({
            from: 'Urban store Ecommerce Website',
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP is: ${otp}. It is valid for one minute.</b>`,
            replyTo: process.env.NODEMAILER_EMAIL,  
        });

        console.log("Email sent:", info.response);
        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}




// Signup 
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cPassword } = req.body;

        if (!name || !phone || !email || !password || !cPassword) {
            req.flash('err','All fields are required')
            return res.redirect("/signup");
        }

        if (password !== cPassword) {
            req.flash('err','Passwords do not match')
            return res.redirect("/signup");
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('err','User already exists')
            return res.redirect("/signup");
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            req.flash('err','Failed to send verification email. Try again.')
            return res.redirect("/signup");
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password };

        console.log("Session data saved:", req.session);
        res.render("verifyOtp");
    } catch (error) {
        console.error("Signup error:", error);
        res.redirect('/pageNotFound');
    }
};

const securePassword = async (password)=>{
    try {
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
       
    } catch (error) {
        console.error("password error:", error);
    }
}

// OTP Verification 
const verifyOtp = async (req, res) => {
    try {
      const {otp} = req.body;
      if(otp===req.session.userOtp){
        const user = req.session.userData
        const passwordHash = await securePassword(user.password);
        const saveUserData = new User({
            name:user.name,
            email:user.email,
            phone:user.phone,
            password:passwordHash,
        })
        await saveUserData.save();
        req.session.user = saveUserData._id;
        res.json({success:true,redirectUrl:"/"})

      }else{
        res.status(400).json({success:false,message:"Invalid OTP, Please try ageain"})
      }
    } catch (error) {
        console.error('Error during OTP verification:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};



// Resend OTP
const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ message: "Email not found in session" });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resent OTP:", otp);
            res.status(200).json({ message: "OTP sent successfully" });
        } else {
            res.status(500).json({ message: "Failed to resend OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Page not found 
const pageNotFound = async (req, res) => {
    try {
        res.status(404).render('page-404');

    } catch (error) {
        res.redirect('/pageNotFound')
    }
 };


//load login page
const loadlogin = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('login',{msg:req.flash('err')});
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error loading login page:", error);
        res.redirect('/pageNotFound');
    }
};



//login page

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if(!email,!password){
            req.flash('err','Please enter your email and password');
            return res.redirect('/login');
       }
 
 

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            req.flash('err','Invaild email id');
            return res.redirect('/login');
        }else if(user.isBlocked){
            req.flash('err','this user blocked!!');
            return res.redirect('/login')
        }


         
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            req.flash('err','password not match')
            return res.redirect('/login');
        }

        
        req.session.user = user._id; 
        console.log("Session user ID:", req.session.user);

        res.redirect('/');  

    } catch (error) {
        console.error("Login error:", error);
        res.redirect('login');
    }
};



//  Home Page
const loadHomePage = async (req, res) => {
    try {
        const userId = req.session.user;  

        if (userId) {
            const user = await User.findById(userId);  
            if (user) {
                console.log("User data retrieved successfully:", user);
                return res.render('home', { user: user });
            } else {
                console.log("No user data found in the database.");
                return res.render('home', { user: null });
            }
        } else {
            return res.render('home', { user: null });
        }
    } catch (error) {
        console.error("Error loading the home page:", error);
        return res.status(500).send("Server Error");
    }
};

const logout = async (req,res)=>{
    try {
       req.session.destroy((err)=>{
           if(err){
               console.log("Session error",err.message);
               return red.redirect('/pageNotFound')
           }
           return res.redirect('/')
       })
    } catch (error) {
       console.log("Logout error",error);
       res.redirect('/pageNotFound')
       
    }
}

//
const getforgotPassword = async (req,res)=>{
       try {
        res.render('forgotPassword',{msg:req.flash('err')})
       } catch (error) {
        res.redirect('/pageNotFound')
       }
}

//
 const verifyemail = async(req,res)=>{
   try {
    const {email} = req.body;
    console.log(req.body);
    
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/
    const emailCheck = await User.findOne({email:email})

    if(!emailPattern.test(email)){
      req.flash('err','email is not correct!!');
      return res.redirect('/login')
    }else if(!emailCheck){
       req.flash('err','this email is not valid')
       return res.redirect('/login')
    }
     
    req.session.userEmail = email;
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
        req.flash('err','Failed to send verification email. Try again.')
        return res.redirect('/login')
    }

    req.session.userOtp = otp;
    req.session.userEmail = email;
    console.log("reset otp",otp);
    
    res.render('resetOtp')
   } catch (error) {
    console.error("Signup error:", error);
    res.redirect('/pageNotFound');
   }
 }

const resetverifyOtp = async (req,res)=>{
    try {
        const {otp} =req.body;
        if(otp===req.session.userOtp){
       res.json({success:true,redirectUrl:'/reset-password'})         
        }else{
            res.json({sucess:false,message:"OTP not matching"})
        }
    } catch (error) {
        res.status(500).json({sucess:false,message:"An error occurred. Please try again"});
    }
}

const resetPassword = async (req,res)=>{
    try {
        res.render('resetPassword');

    } catch (error) {
        res.redirect('/pageNotFound')
    }
}






module.exports = {
    loadHomePage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadlogin,
    login,
    getforgotPassword,
    verifyemail,
    resetverifyOtp,
    resetPassword,
    logout,

};
