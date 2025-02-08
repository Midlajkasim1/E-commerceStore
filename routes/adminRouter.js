const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
 const categoryController = require('../controllers/admin/categoryController');
 const productController = require('../controllers/admin/productController');
 const orderController = require('../controllers/admin/orderController');
 const couponController = require('../controllers/admin/couponController');
 const salesReportController = require('../controllers/admin/salesReportController');
const {adminAuth,adminCheck} = require("../middlewares/auth");
const multer = require('multer');
const storage = require('../helpers/multer');
const { downloadExcelReport } = require('../controllers/admin/salesReportController');
const uploads = multer({storage:storage});


router.get('/login',adminController.loadlogin);
router.post('/login',adminController.login)
router.get('/dashboard', adminCheck,adminController.loadDashboard);
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
router.post('/category/addCategoryOffer',adminCheck,categoryController.addCategoryOffer);
router.post('/category/removeCategoryOffer',adminCheck,categoryController.removeCategoryOffer);
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
router.post('/products/editProduct/deleteImage/:id',adminCheck,productController.deleteSingle);

//order
router.get('/order',adminCheck,orderController.getOrder)
router.get('/orderdetail/:id', adminCheck, orderController.getOrderDetails);
router.post('/order/status-update/:id',adminCheck,orderController.updateStatus)

//coupon
router.get('/coupon',adminCheck,couponController.getCoupon);
router.get('/coupon/add-coupon',adminCheck,couponController.getAddCoupon);
router.post('/coupon/add-coupon',adminCheck,couponController.addCoupon);
router.get('/coupon/list-coupon',adminCheck,couponController.listCoupon);
router.get('/coupon/unlist-coupon',adminCheck,couponController.unListCoupon);
router.get('/coupon/edit-coupon/:id',adminCheck,couponController.getEditCoupon);
router.post('/coupon/edit-coupon',adminCheck,couponController.editCoupon);
router.get('/coupon/delete-coupon/:id',adminCheck,couponController.deleteCoupon);

//sales Report
// router.get('/sales-report',adminCheck,salesReportController.getSalesReport);
router.get('/sales-report/excel', adminCheck, adminController.downloadExcelReport);
router.get('/sales-report/pdf', adminCheck, adminController.downloadPdfReport);



module.exports = router;