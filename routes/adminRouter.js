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
router.get('/category',adminCheck,categoryController.categoryInfo);
router.get('/category/addCategory',adminCheck,categoryController.loadAddCategory);
router.post('/category/addCategory',adminCheck,categoryController.addCategory);
router.get("/category/listCategory",adminCheck,categoryController.getListCategory)
router.get('/category/unlistCategory',adminCheck,categoryController.getUnListCategory)
router.get('/category/editCategory',adminCheck,categoryController.getEditCategory);
router.post('/category/editCategory/:id',adminCheck,categoryController.editCategory);
//product
router.get('/products',adminCheck,productController.getProducts);
router.get('/products/addProducts',adminCheck,productController.getaddProduct)
router.post("/products/addProducts",adminCheck,uploads.array("images",4),productController.addProducts);
router.post('/products/addProductOffer',adminAuth,productController.addProductOffer);
router.post('/products/removeProductsOffer',adminAuth,productController.removeProductOffer)
router.get('/products/blockProduct',adminCheck,productController.blockProduct);
router.get('/products/unblockProduct',adminCheck,productController.unblockProduct)
router.get('/products/editProduct/:id',adminCheck,productController.getEditProduct)
router.post('/products/editProduct/:id',adminCheck,uploads.array("images",4),productController.editProduct);
router.post('/products/editProduct/deleteImage/:id',adminCheck,productController.deleteSingle)


module.exports = router;