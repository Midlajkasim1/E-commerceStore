const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const passport = require('passport');
const { userAuth } = require('../middlewares/auth');


router.get('/pageNotFound',userController.pageNotFound)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp)



router.get('/',userController.loadHomePage);
router.get('/shop',userController.loadShoppingPage);
router.get('/filter',userController.filterProduct);
router.get('/filterPrice',userController.filterByPrice);
router.post('/search',userController.searchProducts);

router.get('/auth/google',passport.authenticate('google'))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/login'}),(req,res)=>{  
      req.session.user =req.user._id;
      req.session.userName = req.username;
    res.redirect('/')
})  

router.get('/login',userController.loadlogin);
router.post('/login',userController.login);


router.post('/logout',userController.logout)
//
router.get('/forgot-password',userController.getforgotPassword);
router.post('/verify-email',userController.verifyemail);
router.post('/reset-otp',userController.resetverifyOtp);
router.post('/resendReset-otp',userController.resendResetOtp)

router.get('/reset-password',userController.getResetPassword);
router.post('/resetPassword',userController.resetPassword);




module.exports= router;