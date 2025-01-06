const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();











// Load Signup Page
const loadSignup = async (req, res) => {
    try {
        res.render('signup');
    } catch (error) {
        console.error("Error loading signup page:", error);
        res.status(500).send("Server error");
    }
};

// OTP Generator
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}
////cwxw gegf ankp nisu

// Send Verification Email
async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 465,  // Use SSL port
            secure: true,  // Use SSL
            requireTLS: true,  // Ensure TLS is used
            auth: {
                user: process.env.NODEMAILER_EMAIL,  // Your Gmail email
                pass: process.env.NODEMAILER_PASSWORD,  // Your app-specific password
            },
        });

        const info = await transporter.sendMail({
            from: 'Urban store Ecommerce Website',
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP is: ${otp}. It is valid for one minute. Resend Otp Buttin will activate after.</b>`,
            replyTo: process.env.NODEMAILER_EMAIL,  // Set a valid reply-to address
        });

        console.log("Email sent:", info.response);
        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}




// Signup Handler
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cPassword } = req.body;

        if (!name || !phone || !email || !password || !cPassword) {
            return res.render("signup", { message: "All fields are required", data: req.body });
        }

        if (password !== cPassword) {
            return res.render("signup", { message: "Passwords do not match", data: req.body });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render("signup", { message: "User already exists", data: req.body });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("signup", { message: "Failed to send verification email. Try again.", data: req.body });
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
        
    }
}

// OTP Verification Handler
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

// Page Not Found Handler
const pageNotFound = async (req, res) => {
    try {
        res.status(404).render('page-404');

    } catch (error) {
        res.redirect('/pageNotFound')
    }
 };


//loadlogin page
const loadlogin = async (req, res) => {
    try {
        console.log("Session user ID:", req.session.user);
        if (!req.session.user) {
            return res.render('login');
        }
        res.redirect('/');
    } catch (error) {
        console.error("Error loading login page:", error);
        res.redirect('/pageNotFound');
    }
};



//login page
// Login Handler
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('login', { message: "User not found" });
        }

        // Check if password matches
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.render('login', { message: "Incorrect password" });
        }

        // Store user ID in session after successful login
        req.session.user = user._id;  // Store the user ID in session
        console.log("Session user ID:", req.session.user);

        res.redirect('/');  // Redirect to home page after login

    } catch (error) {
        console.error("Login error:", error);
        res.render('login', { message: "An error occurred. Please try again later." });
    }
};



// Load Home Page
const loadHomePage = async (req, res) => {
    try {
        const userId = req.session.user;  // Get the user ID from session

        if (userId) {
            const user = await User.findById(userId);  // Use user ID from session
            if (user) {
                console.log("User data retrieved successfully:", user);
                return res.render('home', { user: user });
            } else {
                console.log("No user data found in the database.");
                return res.render('home', { user: null });
            }
        } else {
            console.log("No user logged in.");
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
           return res.redirect('/login')
       })
    } catch (error) {
       console.log("Logout error",error);
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
    logout
};
