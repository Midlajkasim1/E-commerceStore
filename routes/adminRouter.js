const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
 const categoryController = require('../controllers/admin/categoryController');
 const productController = require('../controllers/admin/productController')
const {userAuth,adminAuth,adminCheck} = require("../middlewares/auth");
const multer = require('multer');
const storage = require('../helpers/multer');
const uploads = multer({storage:storage});


router.get('/login',adminController.loadlogin);
router.post('/login',adminController.login)
router.get('/dashboard', adminAuth,adminController.loadDashboard);
router.get('/pageerror',adminController.pageerror)
router.post("/logout",adminController.logout)

//user management
router.get('/users',adminCheck,customerController.customerInfo)
router.get('/blockCustomer',adminCheck,customerController.customerBlocked);
router.get('/unblockCustomer',adminCheck,customerController.customerunBlocked);
//category
router.get('/category',adminCheck,adminAuth,categoryController.categoryInfo);
router.get('/category/addCategory',adminCheck,categoryController.loadAddCategory);
router.post('/category/addCategory',adminCheck,categoryController.addCategory);
router.get("/category/listCategory",adminAuth,categoryController.getListCategory)
router.get('/category/unlistCategory',adminAuth,categoryController.getUnListCategory)
router.get('/category/editCategory',adminAuth,categoryController.getEditCategory);
router.post('/category/editCategory/:id',adminAuth,categoryController.editCategory);
//product
router.get('/products',adminAuth,productController.getProducts)
router.get('/products/addProducts',adminAuth,productController.getaddProduct)
// router.post('/products/addProducts',adminAuth,productController.addProducts)
router.post("/products/addProducts",adminAuth,uploads.array("images",4),productController.addProducts)



module.exports = router;