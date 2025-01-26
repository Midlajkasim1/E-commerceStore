const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Order = require('../../models/orderSchema');
const Address = require('../../models/addressSchema');
const mongoose = require('mongoose');


const getOrder = async (req, res) => {
    try {
        // Search and pagination parameters
        let search = req.query.search || "";
        let page = parseInt(req.query.page) || 1;
        let status = req.query.status || "";

        const limit = 10;
        const skip = (page - 1) * limit;

        // Build search conditions
        const searchConditions = search ? {
            $or: [
                { orderId: { $regex: search, $options: 'i' } }
            ]
        } : {};

        // Build status conditions
        const statusConditions = status ? { status: status } : {};

        // Combine conditions
        const conditions = {
            ...searchConditions,
            ...statusConditions
        };

        // Find orders with pagination and population
        const orders = await Order.find(conditions)
            .populate({
                path: 'userId',
                select: 'name email' // Select specific user fields
            })
            .populate({
                path: 'orderedItems.product',
                select: 'name price' // Select specific product fields
            })
            .sort({ createOn: -1 })
            .skip(skip)
            .limit(limit);

        // Count total orders for pagination
        const totalOrders = await Order.countDocuments(conditions);

        // Render view with orders and pagination info
        res.render('admin-order', { 
            orders: orders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            search: search,
            status: status,
            user: req.user || req.session.user,
            successMessage: req.flash('err'),
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { 
            message: 'Failed to retrieve orders',
            error: error
        });
    }
};
const getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        console.log("order id is :",orderId);
   

        // const orderDetails = await Order.findById(orderId)


        const orders = await Order.findById(orderId).populate('orderedItems.product');
        // console.log('order details',orders);
// console.log(orders)
        console.log('address id is ',orders.address);
        const address = await Address.findOne({
            "address._id": orders.address,  
          });
        //   console.log('new addr',address)

          let selectedAddress;

    if (address) {
      selectedAddress = address.address.find((value) => value._id.toString() === orders.address.toString());
    //   console.log("Matched Address:", selectedAddress);
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
        const orderId = req.params.id; // Get the order ID from the URL
        const { orderStatus, productId } = req.body; // Get the new status and product ID from the form

        console.log("Order ID:", orderId); // Debugging
        console.log("Product ID:", productId); // Debugging
        console.log("Order Status:", orderStatus); // Debugging

        // Validate the orderStatus
        const validStatus = ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Return Request", "Returned"];
        if (!validStatus.includes(orderStatus)) {
            req.flash('err', 'Not a valid status code');
            return res.redirect(`/admin/orderdetail/${orderId}`);
        }

        // Find the order by ID
        const order = await Order.findById(orderId);
        if (!order) {
            req.flash('err', 'Order not found');
            return res.redirect('/admin/orders');
        }

        // If productId is provided, update the status of the specific product
        if (productId) {
            const productToUpdate = order.orderedItems.find(item => item._id.toString() === productId);
            if (!productToUpdate) {
                req.flash('err', 'Product not found in the order');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }

            // Check if the product is already cancelled or returned
            if (productToUpdate.status === "Cancelled" || productToUpdate.status === "Returned") {
                req.flash('err', 'Cannot update status: Product has already been cancelled or returned.');
                return res.redirect(`/admin/orderdetail/${orderId}`);
            }

            // Update the status of the specific product
            productToUpdate.status = orderStatus;
        }

        // Update the overall order status based on the product status
        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === "Delivered")) {
            order.status = "Delivered";
        } else if (allProducts.some(item => item.status === "Out for Delivery")) {
            order.status = "Out for Delivery";
        } else if (allProducts.some(item => item.status === "Shipped")) {
            order.status = "Shipped";
        } else if (allProducts.some(item => item.status === "Processing")) {
            order.status = "Processing";
        } else if (allProducts.some(item => item.status === "Cancelled")) {
            order.status = "Cancelled";
        } else if (allProducts.some(item => item.status === "Returned")) {
            order.status = "Returned";
        } else {
            order.status = "Pending";
        }

        // Save the updated order
        await order.save();

        req.flash('err', 'Status updated successfully');
        return res.redirect('/admin/order'); // Redirect to the order listing page

    } catch (error) {
        console.error("Error updating status:", error);
        req.flash('err', 'Failed to update status');
        return res.redirect(`/admin/orderdetail/${req.params.id}`);
    }
};
module.exports={
    getOrder,
    getOrderDetails,
    updateStatus
}