const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
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
        const categories = await Category.find({ isListed: true });

        // Fetch products based on category and availability
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            quantity: { $gt: 0 }
        }).lean();
 
        // Sort and slice to get the latest 4 products
        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        // If user is logged in
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

        // If no user is logged in
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
        
        const email = req.session.userEmail; // Get email from session
        if (!email) {
            return res.status(400).json({ message: "Email not found in session" });
        }

        const otp = generateOtp(); // Generate new OTP
        const emailSent = await sendVerificationEmail(email, otp); // Send the OTP

        if (emailSent) {
            req.session.userOtp = otp; // Update OTP in session
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
        const userData = await User.findOne({_id: user});
        const categories = await Category.find({isListed: true});
        const categoriesIds = categories.map((category) => category._id.toString());
        const page = parseInt(req.query.page) || 1;
        const sort = req.query.sort || 'default';
        const limit = 9;
        const skip = (page - 1) * limit;

        // Base query
        const baseQuery = {
            isBlocked: false,
            category: {$in: categoriesIds},
            quantity: {$gt: 0},
        };

        // Determine sort options
        let sortOption = {};
        switch(sort) {
            case 'priceHighToLow':
                sortOption = { salePrice: -1 };
                break;
            case 'priceLowToHigh':
                sortOption = { salePrice: 1 };
                break;
            case 'nameAtoZ':
                sortOption = { productName: 1 };
                break;
            case 'nameZtoA':
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdOn: -1 };
        }

        // Get products with sorting
        const products = await Product.find(baseQuery)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(baseQuery);
        const totalPages = Math.ceil(totalProducts/limit);

        const categoriesWithIds = categories.map((category) => ({
            _id: category._id,
            name: category.name
        }));

        res.render('shop', {
            user: userData,
            products: products,
            category: categoriesWithIds,
            totalProducts: totalProducts,
            currentPage: page,
            totalPages: totalPages,
            currentSort: sort,

        });
    } catch (error) {
        res.redirect('/pageNotfound');
    }
};
 //
 const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const category = req.query.category;
        const sort = req.query.sort || 'default';
        const page = parseInt(req.query.page) || 1;
        const limit = 9; // Match the limit from loadShoppingPage
        const skip = (page - 1) * limit;

        // Base query
        const query = {
            isBlocked: false,
            quantity: { $gt: 0 }
        };

        if (category) {
            query.category = category;
        }

        // Determine sort options
        let sortOption = {};
        switch(sort) {
            case 'priceHighToLow':
                sortOption = { salePrice: -1 };
                break;
            case 'priceLowToHigh':
                sortOption = { salePrice: 1 };
                break;
            case 'nameAtoZ':
                sortOption = { productName: 1 };
                break;
            case 'nameZtoA':
                sortOption = { productName: -1 };
                break;
            default:
                sortOption = { createdOn: -1 };
        }

        // Get products with pagination and sorting
        const products = await Product.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean();

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts/limit);

        // Get all categories for the sidebar
        const categories = await Category.find({ isListed: true });

        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user });
            if (userData && category) {
                const searchEntry = {
                    category: category,
                    searchedOn: new Date(),
                };
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        res.render('shop', {
            user: userData,
            products: products,
            category: categories,
            totalPages: totalPages,
            currentPage: page,
            selectedCategory: category || null,
            currentSort: sort
        });

    } catch (error) {
        console.log("Filter Product Error:", error);
        res.redirect('/pageNotFound');
    }
};

 //
 const filterByPrice = async (req,res)=>{
    try {
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const categories = await Category.find({isListed:true}).lean();

        let findProducts = await Product.find({
            salePrice:{$gt:req.query.gt,$lt:req.query.lt},
            isBlocked:false,
            quantity:{$gt:0}

        }).lean();
        findProducts.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
         let itemsPerPage = 6;
         let currentPage = parseInt(req.query.page) || 1;
         let startIndex = (currentPage-1) * itemsPerPage;
         let endIndex =startIndex + itemsPerPage;
         let totalPages = Math.ceil(findProducts.length/itemsPerPage);
         const currentProduct = findProducts.slice(startIndex,endIndex);
         req.session.filterProducts = findProducts;
         res.render('shop',{
            user:userData,
            products:currentProduct,
            category:categories,
            totalPages,
            currentPage,


         })
    } catch (error) {
        console.log(error);
        res.redirect('/pagenotFound')
        
    }
 }
 //
 const searchProducts = async (req,res)=>{
    try {
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const search = req.body.query || ""; 
        
        const categories = await Category.find({isListed:true}).lean();
        const categoriesIds = categories.map(category=>category._id.toString());
        let searchResult = [];
        if(req.session.filteredProducts && req.session.filteredProducts.length>0){
            searchResult = req.session.filteredProducts.filter(product=>{
              product.productName.toLowerCase().includes(search.toLowerCase())  
            })
        }else{
            searchResult = await Product.find({
                productName:{$regex:".*"+search+".*",$options:"i"},
                isBlocked:false,
                quantity:{$gt:0},
                category:{$in:categoriesIds}
            })
        }
        searchResult.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage-1)*itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);
        res.render('shop',{
            search:search,
            user:userData,
            products:currentProduct,
            category:categories,
            totalPages,
            currentPage,
            count: searchResult.length,

        })

    } catch (error) {
        console.log("error:",error);
        res.redirect('/pageNotFound');
    }
 }
 //phone


 //email change
 
 const getchangeEmail = async (req,res) =>{
    try {
        res.render('changeEmail',{message:req.flash('err')})
    } catch (error) {
        console.error('profile page not found');
        res.redirect('/pageNotFound')

    }
}

const changeEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        console.log("Entered email:", email);
        
        // Retrieve the logged-in user's data from the session
        const currentUser = await User.findById(req.session.user);
        if (!currentUser) {
            return res.render('changeEmail', { message: 'User not logged in.' });
        }

        // Get the current user's email
        const originalEmail = currentUser.email;

        // Check if the entered email matches the current email
        if (email !== originalEmail) {
            return res.render('changeEmail', {
                message: 'The entered email does not match your current email.',
            });
        }

        // If email matches, send the OTP
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        
        if (emailSent) {
            // Store OTP and email in session for verification later
            req.session.userOtp = otp;
            req.session.userEmail = email;  //
            req.session.newEmail = email;
            
            // Render the OTP verification page
            res.render('emailChangOtp');
            console.log('OTP sent to:', email);
            console.log('OTP:', otp);
        } else {
            return res.json('email-error');
        }

    } catch (error) {
        console.error("Error during email change:", error);
        res.redirect('/pageNotFound');
    }
};


const resetEmailOtp = async (req,res) =>{
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp===req.session.userOtp){
            console.log("otp match");

            res.json({success:true,redirectUrl:'/update-email'});
        }else{
            console.log( "not match");
            
            res.json({success:false,message:"OTP not matching"})
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured. Please try again"})
    }
}

const resendEmailChangeOtp = async (req,res)=>{
  try {
    console.log("entered");
    const email = req.session.userEmail; // Get email from session


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

const getupdateEmail = async(req,res)=>{
    try {
        res.render('newEmail', {
            message: req.flash('err'),
            smsg:req.flash('sucess')
        });
    } catch (error) {
        console.error('Get reset password error:', error);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/pageNotFound');
    }
}

const updateEmail = async(req,res)=>{
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect('/userProfile')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}




module.exports = {
    loadHomePage,
    loadShoppingPage,
    filterProduct,
    filterByPrice,
    searchProducts,
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
    getchangeEmail,
    changeEmailValid,
    resetEmailOtp,
    resendEmailChangeOtp,
    getupdateEmail,
    updateEmail

};
