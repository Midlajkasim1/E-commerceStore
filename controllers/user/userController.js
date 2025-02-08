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


const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Signup 
const signup = async (req, res) => {
    try {
        const { name, phone, email, password, cPassword,referralCode  } = req.body;

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
            req.flash('err','Failed to send verification email. Try again.')
            return res.redirect("/signup");
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password ,myCode,
            referralCode: referralCode || null };

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
      // Check if session and userData exist
      if (!req.session || !req.session.userOtp || !req.session.userData) {
        return res.status(400).json({
            success: false,
            message: "Session expired or invalid. Please try again."
        });
    }
      if(otp===req.session.userOtp){
        const userData = req.session.userData;
        const passwordHash = await securePassword(userData.password);
        const newUser = new User({
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            password: passwordHash,
            myCode: userData.myCode || generateReferralCode(), // Generate if not exists
            referalCode: userData.referralCode // Store the referral code used during signup
        });
        await newUser.save();
           // Create wallet for new user
           const newWallet = new Wallet({
            user: newUser._id,
            balance: 0,
            transaction: []
        });
        await newWallet.save();

        // Handle referral rewards if referral code was used
        if (userData.referralCode) {
            const referrer = await User.findOne({ myCode: userData.referralCode });
            if (referrer) {
                // Update referrer's wallet (₹100 bonus)
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

                // Update new user's wallet (₹50 bonus)
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
            res.status(200).json({ success:true, message: "OTP sent successfully" });
        } else {
            res.status(500).json({success:false, message: "Failed to resend OTP. Please try again." });
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
                return res.render('home', { user: null, products: productData  });
            }
        }

       
        return res.render('home', { user: null, products: productData });

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
            res.status(200).json({ success:true, message: "OTP sent successfully" });
        } else {
            res.status(500).json({success: false, message: "Failed to resend OTP. Please try again." });
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
            smsg:req.flash('sucess')
        });
    } catch (error) {
        console.error('Get reset password error:', error);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/forgot-password');
    }
};

const resetSecurePassword = async (password)=>{
    try {
        const passwordHash = await bcrypt.hash(password,10);
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
         if(!password,!cpassword){
            req.flash('err','reqiured all fields');
            return res.redirect('/reset-password');
        }

        if(password!==cpassword){
            req.flash('err','paswrd not match');
            return res.redirect('/reset-password');
        }
            const passwordHash =await resetSecurePassword(password)
            await User.updateOne(
                { email: userEmail },
                { $set: { password: passwordHash } }
            );
        
    req.session.userLogged = true;
    req.flash('sucess','Password Updated')
        res.redirect('/login');

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/reset-password');
    }
};
const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = await User.findOne({ _id: user });
        const categories = await Category.find({ isListed: true }).lean();
        const categoriesIds = categories.map(category => category._id.toString());
        const categoryOffers = {};
        categories.forEach(category => {
            categoryOffers[category._id] = category.categoryOffer || 0;
        });

       
        const search = req.query.query || ""; 
        const selectedCategory = req.query.category || ""; 
        const sort = req.query.sort || "default"; 
        const page = parseInt(req.query.page) || 1; 
        const limit = 9; 
        const skip = (page - 1) * limit;
        const gt = parseFloat(req.query.gt) || 0; 
        const lt = parseFloat(req.query.lt) || Infinity; 

        
        const baseQuery = {
            isBlocked: false,
            quantity: { $gt: 0 },
        };

      
        if (search) {
            baseQuery.productName = { $regex: search, $options: "i" };
        }

        // Add category filter if a category is selected
        if (selectedCategory) {
            baseQuery.category = selectedCategory;
        } else {
            baseQuery.category = { $in: categoriesIds }; // Search across all categories
        }

        // Add price filter if price range is provided
        if (req.query.gt || req.query.lt) {
            baseQuery.salePrice = { $gt: gt, $lt: lt };
        }

        // Determine sort options
        let sortOption = {};
        switch (sort) {
            case "priceHighToLow":
                sortOption = { salePrice: -1 };
                break;
            case "priceLowToHigh":
                sortOption = { salePrice: 1 };
                break;
            case "nameAtoZ":
                sortOption = { productName: 1 };
                break;
            case "nameZtoA":
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdOn: -1 }; 
        }

        // Fetch products with pagination and sorting
        const products = await Product.find(baseQuery)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean();

        const totalProducts = await Product.countDocuments(baseQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        // Render the shop page with the results
        res.render("shop", {
            user: userData,
            products,
            categories,
            categoryOffers,
            totalPages,
            currentPage: page,
            search,
            selectedCategory,
            currentSort: sort,
            gt, // Pass price range to the view
            lt,
        });
    } catch (error) {
        console.error("Error loading the shop page:", error);
        res.redirect("/pageNotFound");
    }
};
 //
//  const filterProduct = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const category = req.query.category;
//         const sort = req.query.sort || 'default';
//         const page = parseInt(req.query.page) || 1;
//         const limit = 9; // Match the limit from loadShoppingPage
//         const skip = (page - 1) * limit;

//         // Base query
//         const query = {
//             isBlocked: false,
//             quantity: { $gt: 0 }
//         };

//         if (category) {
//             query.category = category;
//         }

//         // Determine sort options
//         let sortOption = {};
//         switch(sort) {
//             case 'priceHighToLow':
//                 sortOption = { salePrice: -1 };
//                 break;
//             case 'priceLowToHigh':
//                 sortOption = { salePrice: 1 };
//                 break;
//             case 'nameAtoZ':
//                 sortOption = { productName: 1 };
//                 break;
//             case 'nameZtoA':
//                 sortOption = { productName: -1 };
//                 break;
//             default:
//                 sortOption = { createdOn: -1 };
//         }

//         // Get products with pagination and sorting
//         const products = await Product.find(query)
//             .sort(sortOption)
//             .skip(skip)
//             .limit(limit)
//             .lean();

//         const totalProducts = await Product.countDocuments(query);
//         const totalPages = Math.ceil(totalProducts/limit);

//         // Get all categories for the sidebar
//         const categories = await Category.find({ isListed: true });

//         let userData = null;
//         if (user) {
//             userData = await User.findOne({ _id: user });
//             if (userData && category) {
//                 const searchEntry = {
//                     category: category,
//                     searchedOn: new Date(),
//                 };
//                 userData.searchHistory.push(searchEntry);
//                 await userData.save();
//             }
//         }

//         res.render('shop', {
//             user: userData,
//             products: products,
//             category: categories,
//             totalPages: totalPages,
//             currentPage: page,
//             selectedCategory: category || null,
//             currentSort: sort
//         });

//     } catch (error) {
//         console.log("Filter Product Error:", error);
//         res.redirect('/pageNotFound');
//     }
// };

//  //
//  const filterByPrice = async (req,res)=>{
//     try {
//         const user = req.session.user;
//         const userData = await User.findOne({_id:user});
//         const categories = await Category.find({isListed:true}).lean();

//         let findProducts = await Product.find({
//             salePrice:{$gt:req.query.gt,$lt:req.query.lt},
//             isBlocked:false,
//             quantity:{$gt:0}

//         }).lean();
//         findProducts.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
//          let itemsPerPage = 6;
//          let currentPage = parseInt(req.query.page) || 1;
//          let startIndex = (currentPage-1) * itemsPerPage;
//          let endIndex =startIndex + itemsPerPage;
//          let totalPages = Math.ceil(findProducts.length/itemsPerPage);
//          const currentProduct = findProducts.slice(startIndex,endIndex);
//          req.session.filterProducts = findProducts;
//          res.render('shop',{
//             user:userData,
//             products:currentProduct,
//             category:categories,
//             totalPages,
//             currentPage,


//          })
//     } catch (error) {
//         console.log(error);
//         res.redirect('/pagenotFound')
        
//     }
//  }
//  // products
//  const searchProducts = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const search = req.body.query || ""; // Search query
//         const selectedCategory = req.query.category || req.body.category || ""; // Selected category (from query or body)
//         const currentPage = parseInt(req.query.page) || 1; // Current page for pagination
//         const itemsPerPage = 6; // Number of items per page

//         // Fetch user data if logged in
//         const userData = user ? await User.findOne({ _id: user }).lean() : null;

//         // Fetch all listed categories
//         const categories = await Category.find({ isListed: true }).lean();
//         const categoriesIds = categories.map(category => category._id.toString());

//         // Build the base query
//         const baseQuery = {
//             productName: { $regex: search, $options: "i" }, // Case-insensitive search
//             isBlocked: false,
//             quantity: { $gt: 0 },
//         };

//         // Add category filter if a category is selected
//         if (selectedCategory) {
//             baseQuery.category = selectedCategory; // Filter by selected category
//         } else {
//             baseQuery.category = { $in: categoriesIds }; // Search across all categories
//         }

//         // Fetch products with pagination and sorting
//         const totalProducts = await Product.countDocuments(baseQuery);
//         const totalPages = Math.ceil(totalProducts / itemsPerPage);

//         const products = await Product.find(baseQuery)
//             .sort({ createdOn: -1 }) // Sort by creation date (newest first)
//             .skip((currentPage - 1) * itemsPerPage)
//             .limit(itemsPerPage)
//             .lean();

//         // Render the shop page with the results
//         res.render('shop', {
//             search,
//             user: userData,
//             products,
//             category: categories,
//             totalPages,
//             currentPage,
//             count: totalProducts, // Total number of products matching the query
//             selectedCategory, // Pass the selected category to the view
//         });

//     } catch (error) {
//         console.error("Error in searchProducts:", error);
//         req.flash('error', 'Something went wrong. Please try again.');
//         res.redirect('/pageNotFound');
//     }
// };
 //email update

const getupdateEmail = async(req,res)=>{
    try {
        res.render('newEmail', {
            user: req.user || req.session.user , 

            message: req.flash('err'),
            smsg:req.flash('sucess')
        });
    } catch (error) {
        console.error('Get reset password error:', error);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/pageNotFound');
    }
}

const updateEmail = async (req,res)=>{
    try {
        const {newEmail} =req.body;
       const userId = req.session.user;
       const currentUser = await User.findById(userId);
               if (!currentUser) {
                req.flash('err','User not logged in.');
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
               if(newEmail===originalEmail){
             req.flash('err','The email is similar')
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
                        res.redirect('/update-email');                    }

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
const resendEmailChangeOtp = async (req,res)=>{
  try {
    console.log("entered");
    const email = req.session.userEmail; 

    if(!email){
        return res.status(400).json({message:"Email not found in session"});
    }
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email,otp);

    if(emailSent){
        req.session.userOtp = otp;
        console.log("Resent Otp",otp);
        res.status(200).json({success:true, message:"OTP sent successfully"});
        
    }else{
        res.status(500).json({success: false, message: "Failed to resend OTP. Please try again." });

    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}






module.exports = {
    loadHomePage,
    loadShoppingPage,
    // filterProduct,
    // filterByPrice,
    // searchProducts,
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
