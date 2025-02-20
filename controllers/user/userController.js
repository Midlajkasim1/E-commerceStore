const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const env = require('dotenv').config();



// Load Signup Page
const loadSignup = async (req, res) => {
    try {
        if (req.session) {
            res.render('signup', { message: req.flash('err') });
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


const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Signup 
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cPassword, referralCode } = req.body;

        if (!name || !phone || !email || !password || !cPassword) {
            req.flash('err', 'All fields are required')
            return res.redirect("/signup");
        }

        if (password !== cPassword) {
            req.flash('err', 'Passwords do not match')
            return res.redirect("/signup");
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.flash('err', 'User already exists')
            return res.redirect("/signup");
        }

        const myCode = generateReferralCode();
        let referrerUser = null;
        if (referralCode) {
            referrerUser = await User.findOne({ myCode: referralCode });
            if (!referrerUser) {
                req.flash('err', 'Invalid referral code');
                return res.redirect("/signup");
            }
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            req.flash('err', 'Failed to send verification email. Try again.')
            return res.redirect("/signup");
        }

        req.session.userOtp = otp;
        req.session.userData = {
            name, phone, email, password, myCode,
            referralCode: referralCode || null
        };

        console.log("Session data saved:", req.session);
        res.render("verifyOtp");
    } catch (error) {
        console.error("Signup error:", error);
        res.redirect('/pageNotFound');
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;

    } catch (error) {
        console.error("password error:", error);
    }
}

// OTP Verification 
const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!req.session || !req.session.userOtp || !req.session.userData) {
            return res.status(400).json({
                success: false,
                message: "Session expired or invalid. Please try again."
            });
        }
        if (otp === req.session.userOtp) {
            const userData = req.session.userData;
            const passwordHash = await securePassword(userData.password);
            const newUser = new User({
                name: userData.name,
                email: userData.email,
                phone: userData.phone,
                password: passwordHash,
                myCode: userData.myCode || generateReferralCode(),
                referalCode: userData.referralCode
            });
            await newUser.save();
            const newWallet = new Wallet({
                user: newUser._id,
                balance: 0,
                transaction: []
            });
            await newWallet.save();

            if (userData.referralCode) {
                const referrer = await User.findOne({ myCode: userData.referralCode });
                if (referrer) {
                    const referrerWallet = await Wallet.findOne({ user: referrer._id });
                    if (referrerWallet) {
                        referrerWallet.balance += 100;
                        referrerWallet.transaction.push({
                            amount: 100,
                            type: 'credit',
                            transactionId: crypto.randomBytes(8).toString('hex'),
                            productName: ['Referral Bonus']
                        });
                        await referrerWallet.save();
                    }

                    newWallet.balance += 50;
                    newWallet.transaction.push({
                        amount: 50,
                        type: 'credit',
                        transactionId: crypto.randomBytes(8).toString('hex'),
                        productName: ['Welcome Bonus']
                    });
                    await newWallet.save();
                }
            }




            req.session.user = newUser._id;
            req.session.userOtp = null;
            req.session.userData = null;
            res.json({ success: true, redirectUrl: "/" })

        } else {
            res.status(400).json({ success: false, message: "Invalid OTP, Please try ageain" })
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
            res.status(200).json({ success: true, message: "OTP sent successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again." });
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
            return res.render('login', { msg: req.flash('err') });
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

        if (!email, !password) {
            req.flash('err', 'Please enter your email and password');
            return res.redirect('/login');
        }




        const user = await User.findOne({ email });
        if (!user) {
            req.flash('err', 'Invaild email id');
            return res.redirect('/login');
        } else if (user.isBlocked) {
            req.flash('err', 'this user blocked!!');
            return res.redirect('/login')
        }



        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            req.flash('err', 'password not match')
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
        const categories = await Category.find({ isListed: true });


        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        }).lean();


        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                console.log("User data retrieved successfully:", user);
                return res.render('home', { user: user, products: productData });
            } else {
                console.log("No user data found in the database.");
                return res.render('home', { user: null, products: productData });
            }
        }


        return res.render('home', { user: null, products: productData });

    } catch (error) {
        console.error("Error loading the home page:", error);
        return res.status(500).send("Server Error");
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log("Session error", err.message);
                return red.redirect('/pageNotFound')
            }
            return res.redirect('/')
        })
    } catch (error) {
        console.log("Logout error", error);
        res.redirect('/pageNotFound')

    }
}

//
const getforgotPassword = async (req, res) => {
    try {
        res.render('forgotPassword', { msg: req.flash('err') })
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

//
const verifyemail = async (req, res) => {
    try {
        const { email } = req.body;
        console.log(req.body);

        const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/
        const emailCheck = await User.findOne({ email: email })

        if (!emailPattern.test(email)) {
            req.flash('err', 'email is not correct!!');
            return res.redirect('/login')
        } else if (!emailCheck) {
            req.flash('err', 'this email is not valid')
            return res.redirect('/login')
        }

        req.session.userEmail = email;
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            req.flash('err', 'Failed to send verification email. Try again.')
            return res.redirect('/login')
        }

        req.session.userOtp = otp;
        req.session.userEmail = email;
        console.log("reset otp", otp);

        res.render('resetOtp')
    } catch (error) {
        console.error("Signup error:", error);
        res.redirect('/pageNotFound');
    }
}

const resetverifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (otp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: '/reset-password' })
        } else {
            res.json({ sucess: false, message: "OTP not matching" })
        }
    } catch (error) {
        res.status(500).json({ sucess: false, message: "An error occurred. Please try again" });
    }
}
//

const resendResetOtp = async (req, res) => {
    try {

        const email = req.session.userEmail;
        if (!email) {
            return res.status(400).json({ message: "Email not found in session" });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            console.log("Resent OTP:", otp);
            res.status(200).json({ success: true, message: "OTP sent successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getResetPassword = async (req, res) => {
    try {
        res.render('resetPassword', {
            message: req.flash('err'),
            smsg: req.flash('sucess')
        });
    } catch (error) {
        console.error('Get reset password error:', error);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/forgot-password');
    }
};

const resetSecurePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;

    } catch (error) {
        console.error("password error:", error);
    }
}

const resetPassword = async (req, res) => {
    try {
        const { password, cpassword } = req.body;
        const userEmail = req.session.userEmail;
        console.log(req.body);
        if (!password, !cpassword) {
            req.flash('err', 'reqiured all fields');
            return res.redirect('/reset-password');
        }

        if (password !== cpassword) {
            req.flash('err', 'paswrd not match');
            return res.redirect('/reset-password');
        }
        const passwordHash = await resetSecurePassword(password)
        await User.updateOne(
            { email: userEmail },
            { $set: { password: passwordHash } }
        );

        req.session.userLogged = true;
        req.flash('sucess', 'Password Updated')
        res.redirect('/login');

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/reset-password');
    }
};
const loadShoppingPage = async (req, res) => {
    try {
        // Get user data
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });

        // Get categories
        const categories = await Category.find({ isListed: true }).lean();
        const categoriesIds = categories.map(category => category._id.toString());
        const categoryOffers = {};
        categories.forEach(category => {
            categoryOffers[category._id] = category.categoryOffer || 0;
        });

        // Extract query parameters with defaults
        const {
            query: searchQuery = "",
            category: selectedCategory = "",
            sort = "default",
            page = 1,
            gt: minPrice = "",
            lt: maxPrice = ""
        } = req.query;

        // Pagination setup
        const limit = 9;
        const skip = (parseInt(page) - 1) * limit;

        // Build the base query
        let baseQuery = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        // Enhanced search filter for both product name and category
        if (searchQuery.trim()) {
            // First, find matching category IDs
            const matchingCategories = await Category.find({
                name: { $regex: searchQuery.trim(), $options: 'i' }
            }).select('_id');

            const matchingCategoryIds = matchingCategories.map(cat => cat._id);

            baseQuery.$or = [
                // Match product name
                {
                    productName: {
                        $regex: searchQuery.trim(),
                        $options: 'i'  // Case-insensitive
                    }
                },
                // Match products in matching categories
                {
                    category: {
                        $in: matchingCategoryIds
                    }
                }
            ];
        }

        // Add category filter if specifically selected
        if (selectedCategory) {
            // Override the category condition from search
            baseQuery.category = selectedCategory;
        } else if (!searchQuery.trim()) {
            // If no search and no specific category, show all listed categories
            baseQuery.category = { $in: categoriesIds };
        }

        // Add price range filter
        if (minPrice || maxPrice) {
            baseQuery.salePrice = {};
            if (minPrice) baseQuery.salePrice.$gte = parseFloat(minPrice);
            if (maxPrice) baseQuery.salePrice.$lte = parseFloat(maxPrice);
        }

        // Define sort options
        const sortOptions = {
            default: { createdOn: -1 },
            priceHighToLow: { salePrice: -1 },
            priceLowToHigh: { salePrice: 1 },
            nameAtoZ: { productName: 1 },
            nameZtoA: { productName: -1 }
        };

        // Execute product query
        const products = await Product.find(baseQuery)
            .sort(sortOptions[sort])
            .skip(skip)
            .limit(limit)
            .lean();

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(baseQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        // Build query string for pagination and filters
        const queryParams = new URLSearchParams();
        if (searchQuery) queryParams.set('query', searchQuery);
        if (selectedCategory) queryParams.set('category', selectedCategory);
        if (sort !== 'default') queryParams.set('sort', sort);
        if (minPrice) queryParams.set('gt', minPrice);
        if (maxPrice) queryParams.set('lt', maxPrice);

        // Render the page
        res.render("shop", {
            user: userData,
            products,
            categories,
            categoryOffers,
            totalPages,
            currentPage: parseInt(page),
            search: searchQuery,
            selectedCategory,
            currentSort: sort,
            gt: minPrice,
            lt: maxPrice,
            queryString: queryParams.toString(),
            totalProducts
        });

    } catch (error) {
        console.error("Error loading the shop page:", error);
        res.redirect("/pageNotFound");
    }
};
//email update

const getupdateEmail = async (req, res) => {
    try {
        res.render('newEmail', {
            user: req.user || req.session.user,

            message: req.flash('err'),
            smsg: req.flash('sucess')
        });
    } catch (error) {
        console.error('Get reset password error:', error);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/pageNotFound');
    }
}

const updateEmail = async (req, res) => {
    try {
        const { newEmail } = req.body;
        const userId = req.session.user;
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            req.flash('err', 'User not logged in.');
            return res.redirect('/login')
        }
        const existingUser = await User.findOne({ email: newEmail });
        if (existingUser) {
            req.flash('err', 'This email is already in use by another account.');
            return res.redirect('/update-email');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            req.flash('err', 'Please enter a valid email address.');
            return res.redirect('/update-email');
        }


        const originalEmail = currentUser.email;
        if (newEmail === originalEmail) {
            req.flash('err', 'The email is similar')
            return res.redirect('/update-email');
        }
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(newEmail, otp);
        if (emailSent) {
            req.session.userOtp = otp;
            req.session.userEmail = newEmail;  //
            req.session.newEmail = newEmail;

            res.render('emailChangOtp');
            console.log('OTP sent to:', newEmail);
            console.log('OTP:', otp);
        } else {
            req.flash('err', 'Failed to send verification email. Please try again.');
            res.redirect('/update-email');
        }

    } catch (error) {
        console.error("Error during email change:", error);
        res.redirect('/pageNotFound');
    }
}

const resetEmailOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        if (enteredOtp === req.session.userOtp) {
            console.log("OTP match");

            const newEmail = req.session.newEmail;
            const userId = req.session.user;

            await User.findByIdAndUpdate(userId, { email: newEmail });

            req.session.userOtp = null;
            req.session.newEmail = null;

            res.json({ success: true, redirectUrl: '/userProfile' });
        } else {
            console.log("OTP not match");
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        console.error("Error during email reset:", error);
        res.status(500).json({ success: false, message: "An error occurred. Please try again" });
    }
};
const resendEmailChangeOtp = async (req, res) => {
    try {
        console.log("entered");
        const email = req.session.userEmail;

        if (!email) {
            return res.status(400).json({ message: "Email not found in session" });
        }
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            console.log("Resent Otp", otp);
            res.status(200).json({ success: true, message: "OTP sent successfully" });

        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again." });

        }
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}






module.exports = {
    loadHomePage,
    loadShoppingPage,
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
    getResetPassword,
    resendResetOtp,
    resetPassword,
    logout,
    resetEmailOtp,
    resendEmailChangeOtp,
    getupdateEmail,
    updateEmail

};
