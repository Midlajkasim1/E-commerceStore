const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const {userAuth,adminAuth} = require("../middlewares/auth");



router.get('/login',adminController.loadlogin);
router.post('/login',adminController.login)
router.get('/dashboard', adminAuth,adminController.loadDashboard);
router.get('/pageerror',adminController.pageerror)
router.get("/logout",adminController.logout)

//user management
router.get('/users',adminAuth,customerController.customerInfo)
router.get('/blockCustomer',adminAuth,customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.customerunBlocked);

module.exports = router;