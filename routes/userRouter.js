const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userController');
const productController = require('../controllers/user/productController');
const profileController = require('../controllers/user/profileController');
const cartController = require('../controllers/user/cartController');
const checkoutController = require('../controllers/user/checkoutController');
const ordercontroller =require('../controllers/user/orderController');
const wishlistController = require('../controllers/user/wishlistController');
const WalletController = require('../controllers/user/walletController');
const passport = require('passport');
const { userAuth,blockCheck } = require('../middlewares/auth');


router.get('/pageNotFound',userController.pageNotFound)
router.get('/signup',userController.loadSignup)
router.post('/signup',userController.signup)
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp)



router.get('/',blockCheck, userController.loadHomePage);
// router.get('/getAvailableSizes/:productId',blockCheck,userController.getAvailableSizes)
router.get('/shop',blockCheck,userController.loadShoppingPage);



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

//product management
router.get('/productDetails',productController.productDetails);

//profile management
router.get('/userProfile',userAuth,profileController.getUserProfile);
router.get('/edit-userProfile',userAuth,profileController.getEditProfile);
router.post('/edit-userProfile',userAuth,profileController.editProfile);




//change email

router.get('/update-email',userAuth,userController.getupdateEmail);
router.post('/update-email',userAuth,userController.updateEmail);
router.post('/resetEmail-otp',userAuth,userController.resetEmailOtp);
router.post('/resendEmailChange-otp',userAuth,userController.resendEmailChangeOtp)






//change password
router.post('/change-password',userAuth,profileController.changePassword);


//address 
router.get('/myaddress',userAuth,profileController.getAddress);
router.post('/addAddress',userAuth,profileController.postAddAddress);
router.get('/editAddress',userAuth,profileController.getEditAddress);
router.post('/editAddress',userAuth,profileController.editAddress);
router.get('/deleteAddress',userAuth,profileController.deleteAddress);

//cart
// router.get('/addToCart',userAuth,cartController.getAddToCart);
router.post('/addToCart/:id',userAuth,cartController.addToCartByGet);
router.get('/cart',userAuth,cartController.getAddToCart)
router.post('/cart/update-quantity',userAuth, cartController.updateCartQuantity);
router.post('/cart/remove',userAuth,cartController.removeFromCart);


//review
router.post('/submit-review',userAuth,productController.submitReview);
router.post('/delete-review/:reviewId/:productId',userAuth,productController.deleteReview)

//checkout
router.get('/checkout',userAuth,checkoutController.getCheckout );
router.post('/checkout-addAddress',userAuth,checkoutController.checkoutAddAddress);
router.post('/checkout/edit-address', checkoutController.checkOuteditAddress);


// router.post('/place-order',userAuth,checkoutController.placeOrder );
router.post('/place-order', userAuth, ordercontroller.placeOrder);
router.post('/verify-payment',userAuth,ordercontroller.verifyPayment);

//order
router.get('/profile/order',userAuth,ordercontroller.getOrderDetails)
router.get('/details/:id',userAuth,ordercontroller.getOrderMoreDetails);
router.get('/download-invoice/:orderId',userAuth,ordercontroller.generateInvoice )
router.post('/order/cancel-product',userAuth,ordercontroller.cancelProductOrder);
router.post('/order/return-product',userAuth,ordercontroller.returnProductOrder);
router.get('/payment-failed/:orderId',userAuth,ordercontroller.handleFailedPayment);
router.post('/retry-payment',userAuth,ordercontroller.retryPayment);
router.post('/verify-retry-payment',userAuth,ordercontroller.verifyRetryPayment)

//wishlist            
router.get('/wishlist',userAuth,wishlistController.getWishlist)
router.post('/addToWishlist',userAuth,wishlistController.addToWishlist);
router.get('/removeFromWishlist',userAuth,wishlistController.removeProduct);

// userRouter.post('/applycouoponcode',applyCoupon)
// userRouter.post('/removecoupon',removeCoupon)
router.get('/get-available-coupons',userAuth,checkoutController.getAvailableCoupons)
router.post('/applycouponcode',userAuth,checkoutController.applyCoupon);
router.post('/removecoupon',userAuth,checkoutController.removeCoupon);

//wallet
router.get('/wallet',userAuth,WalletController.getWallet)
// router.get('/wallet/transactions', userAuth, WalletController.getTransactions);
router.get('/wallet/history', userAuth, WalletController.getTransactionHistory);
router.post('/create-wallet-order',userAuth,WalletController.createWalletOrder);
router.post('/verify-wallet-payment',userAuth,WalletController.verifyWalletPayment);

//about
router.get('/about',userController.loadAbout);
router.get('/contact-us',userController.loadContactUs)



module.exports= router;