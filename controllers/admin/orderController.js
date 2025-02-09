const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Address = require('../../models/addressSchema');
const {handleRefund} = require('../user/orderController')
const mongoose = require('mongoose');

// orderController.js
const getOrder = async (req, res) => {
    try {
        const limit = 10; // 10 orders per page
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        // Get total orders count
        const totalOrders = await Order.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        // If requested page is invalid, redirect to first page
        if (page < 1 || (page > totalPages && totalPages > 0)) {
            return res.redirect('/admin/order'); // Make sure to use the correct path
        }

        const orders = await Order.find()
            .populate({
                path: 'userId',
                select: 'name email'
            })
            .sort({ createOn: -1 })
            .skip(skip)
            .limit(limit);

        return res.render('admin-order', {  // Make sure path matches your view structure
            orders,
            currentPage: page,
            totalPages: Math.max(totalPages, 1), // Ensure at least 1 page
            successMessage: req.flash('success')
        });

    } catch (error) {
        console.error('Error in getOrder:', error);
        return res.render('admin/admin-order', {
            orders: [],
            currentPage: 1,
            totalPages: 1,
            successMessage: req.flash('success')
        });
    }
};
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        console.log("order id is :",orderId);
   
        const orders = await Order.findById(orderId).populate('orderedItems.product');
        console.log('address id is ',orders.address);
        const address = await Address.findOne({
            "address._id": orders.address,  
          });

          let selectedAddress;

    if (address) {
      selectedAddress = address.address.find((value) => value._id.toString() === orders.address.toString());
    } else {
      console.log("No address found");
    }
    console.log(orders)
        return res.render('admin-orderDetails',{order:orders,address:selectedAddress,message:req.flash('err')})

        
        
    }catch{
       
        res.status(500).send('server error');
         
    }
}
const updateStatus = async (req, res) => {
    try {
        const orderId = req.params.id; 
        const { orderStatus, productId } = req.body; 


        const validStatus = ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Return Request", "Returned"];
        if (!validStatus.includes(orderStatus)) {
            req.flash('err', 'Not a valid status code');
            return res.redirect(`/admin/orderdetail/${orderId}`);
        }

        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('err', 'Order not found');
            return res.redirect('/admin/orders');
        }

        if (productId) {
            const productToUpdate = order.orderedItems.find(item => item._id.toString() === productId);
            if (!productToUpdate) {
                req.flash('err', 'Product not found in the order');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }
            if (productToUpdate.status === "Delivered") {
                req.flash('err', 'Cannot update status: Product has already been delivered');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }


            if (productToUpdate.status === "Cancelled" || productToUpdate.status === "Returned") {
                req.flash('err', 'Cannot update status: Product has already been cancelled or returned.');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }
            if (orderStatus === "Delivered" && 
                (productToUpdate.status === "Cancelled" || productToUpdate.status === "Returned")) {
                req.flash('err', 'Cannot mark cancelled or returned product as delivered');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }

            productToUpdate.status = orderStatus;
        }

        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === "Delivered")) {
            order.status = "Delivered";
        } else if (allProducts.some(item => item.status === "Out for Delivery")) {
            order.status = "Out for Delivery";
        } else if (allProducts.some(item => item.status === "Shipped")) {
            order.status = "Shipped";
        } else if (allProducts.some(item => item.status === "Processing")) {
            order.status = "Processing";
        } else if (allProducts.some(item => item.status === "Returned")) {
            order.status = "Returned";
        } else {
            order.status = "Pending";
        }

        await order.save();

        req.flash('err', 'Status updated successfully');
        return res.redirect('/admin/order'); 

    } catch (error) {
        console.error("Error updating status:", error);
        req.flash('err', 'Failed to update status');
        return res.redirect(`/admin/orderdetail/${req.params.id}`);
    }
};

const STATUS = {
    RETURN_REQUEST: 'Return Request',
    RETURNED: 'Returned'
};

const approveReturnRequest = async (req, res) => {
    const { orderId } = req.params;
    const { productId } = req.body;

    // Validate input
    if (!orderId || !productId) {
        return res.status(400).json({
            success: false,
            message: "Order ID and Product ID are required."
        });
    }

    try {
        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        // Find the product in the order
        const productItem = order.orderedItems.find(item => item._id.toString() === productId);
        if (!productItem) {
            return res.status(404).json({
                success: false,
                message: "Product not found in the order."
            });
        }

        // Check if the product has a pending return request
        if (productItem.status !== STATUS.RETURN_REQUEST) {
            return res.status(400).json({
                success: false,
                message: "This product does not have a pending return request."
            });
        }

        // Find the product in the catalog
        const product = await Product.findById(productItem.product);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found in catalog."
            });
        }

        // Calculate refund amount
        const refundAmount = productItem.price * productItem.quantity;

        // Process refund
        const refundResult = await handleRefund(
            order.userId,
            refundAmount,
            [product.productName],
            orderId
        );

        if (!refundResult.success) {
            throw new Error("Refund processing failed.");
        }

        // Update product inventory
        const selectedSize = productItem.size;
        if (product.size && product.size[selectedSize] !== undefined) {
            product.size[selectedSize] += productItem.quantity;
            product.quantity += productItem.quantity;
            await product.save();
        }

        // Update product status to Returned
        productItem.status = STATUS.RETURNED;

        // Update overall order status
        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === STATUS.RETURNED)) {
            order.status = STATUS.RETURNED;
        } else if (allProducts.some(item => item.status === STATUS.RETURN_REQUEST)) {
            order.status = STATUS.RETURN_REQUEST;
        }

        await order.save();

        // Redirect with success message
      return res.redirect('/admin/order')

    } catch (error) {
        console.error("Error while approving return request:", error);
    }
};

module.exports={
    getOrder,
    getOrderDetails,
    updateStatus,
    approveReturnRequest
}