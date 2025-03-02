const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Address = require('../../models/addressSchema');
const {handleRefund} = require('../user/orderController')
const mongoose = require('mongoose');

const getOrder = async (req, res) => {
    try {
        const limit = 10; 
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const orderFilter = { status: { $ne: 'failed' } };

        const totalOrders = await Order.countDocuments(orderFilter);
        const totalPages = Math.ceil(totalOrders / limit);

        if (page < 1 || (page > totalPages && totalPages > 0)) {
            return res.redirect('/admin/order'); 
        }

        const orders = await Order.find(orderFilter)
            .populate({
                path: 'userId',
                select: 'name email'
            })
            .select('orderId userId createOn totalPrice finalAmount status paymentMethod orderedItems') 
            .sort({ createOn: -1 })
            .skip(skip)
            .limit(limit);

        const formattedOrders = orders.map(order => ({
            ...order.toObject(),
            createOn: new Date(order.createOn).toLocaleDateString(),
            orderId: order.orderId,
            customerName: order.userId?.name || 'N/A',
            totalPrice: order.totalPrice.toFixed(2),
            finalAmount: order.finalAmount.toFixed(2),
            status: order.status,
            paymentMethod: order.paymentMethod
        }));

        return res.render('admin-order', {  
            orders: formattedOrders,
            currentPage: page,
            totalPages: Math.max(totalPages, 1), 
            successMessage: req.flash('success')
        });

    } catch (error) {
        console.error('Error in getOrder:', error);
        return res.render('admin/admin-order', {
            orders: [],
            currentPage: 1,
            totalPages: 1,
            successMessage: req.flash('success'),

        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        // console.log("order id is :",orderId);
   
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.redirect('/pageNotFound');
        }

        const order = await Order.findById(orderId)
        .populate('orderedItems.product')
        .populate('address');
        if (!order) {
            req.flash('err', 'Order not found');
            return res.redirect('/admin/orders');
        }

        const deliveryAddress = order.shippingAddress;


        return res.render('admin-orderDetails', {
            order: order,
            address: deliveryAddress,
            originalAddress: order.address,
            successMessage: req.flash('err')
        });

        
        
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
        
          // Define the valid status transitions
          const statusFlow = {
            "Pending": ["Processing", "Cancelled"],
            "Processing": ["Shipped", "Cancelled"],
            "Shipped": ["Out for Delivery", "Cancelled"],
            "Out for Delivery": ["Delivered", "Cancelled"],
            "Delivered": ["Return Request"],
            "Cancelled": [],
            "Return Request": ["Returned"],
            "Returned": []
        };

        // Check if the new status is a valid transition from the current status
        if (!statusFlow[order.status].includes(orderStatus)) {
            req.flash('err', `Cannot change status from ${order.status} to ${orderStatus}`);
            return res.redirect(`/admin/orderdetail/${orderId}`);
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
        return res.redirect(`/admin/orderdetail/${orderId}`);

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

    if (!orderId || !productId) {
        return res.status(400).json({
            success: false,
            message: "Order ID and Product ID are required."
        });
    }

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const productItem = order.orderedItems.find(item => item._id.toString() === productId);
        if (!productItem) {
            return res.status(404).json({
                success: false,
                message: "Product not found in the order."
            });
        }

        if (productItem.status !== STATUS.RETURN_REQUEST) {
            return res.status(400).json({
                success: false,
                message: "This product does not have a pending return request."
            });
        }

        const product = await Product.findById(productItem.product);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found in catalog."
            });
        }

        const refundAmount = productItem.price * productItem.quantity;

        const refundResult = await handleRefund(
            order.userId,
            refundAmount,
            [product.productName],
            orderId
        );

        if (!refundResult.success) {
            throw new Error("Refund processing failed.");
        }

        const selectedSize = productItem.size;
        if (product.size && product.size[selectedSize] !== undefined) {
            product.size[selectedSize] += productItem.quantity;
            product.quantity += productItem.quantity;
            await product.save();
        }

        productItem.status = STATUS.RETURNED;

        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === STATUS.RETURNED)) {
            order.status = STATUS.RETURNED;
        } else if (allProducts.some(item => item.status === STATUS.RETURN_REQUEST)) {
            order.status = STATUS.RETURN_REQUEST;
        }

        await order.save();

      return res.redirect('/admin/order')

    } catch (error) {
        console.error("Error while approving return request:", error);
    }
};

const declineReturnRequest = async (req, res) => {
    const { orderId } = req.params;
    const { productId, declineReason } = req.body;

    if (!orderId || !productId) {
        req.flash('err', "Order ID and Product ID are required.");
        return res.redirect(`/admin/orderdetail/${orderId}`);
    }

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('err', "Order not found.");
            return res.redirect('/admin/order');
        }

        const productItem = order.orderedItems.find(item => item._id.toString() === productId);
        if (!productItem) {
            req.flash('err', "Product not found in the order.");
            return res.redirect(`/admin/orderdetail/${orderId}`);
        }

        if (productItem.status !== STATUS.RETURN_REQUEST) {
            req.flash('err', "This product does not have a pending return request.");
            return res.redirect(`/admin/orderdetail/${orderId}`);
        }

        productItem.status = "Delivered";
        
        const returnReason = productItem.returnReason; 
        productItem.returnDeclinedReason = declineReason || " Your Return request is declined ";

        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === "Delivered")) {
            order.status = "Delivered";
        } else if (allProducts.some(item => item.status === STATUS.RETURN_REQUEST)) {
            order.status = STATUS.RETURN_REQUEST;
        }

        await order.save();

        req.flash('err', 'Return request declined successfully');
        return res.redirect(`/admin/orderdetail/${orderId}`);

    } catch (error) {
        console.error("Error while declining return request:", error);
        req.flash('err', 'Failed to process return decline');
        return res.redirect(`/admin/orderdetail/${orderId}`);
    }
};

module.exports={
    getOrder,
    getOrderDetails,
    updateStatus,
    approveReturnRequest,
    declineReturnRequest
}