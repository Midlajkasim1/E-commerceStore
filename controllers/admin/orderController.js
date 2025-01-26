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
            user: req.user || req.session.user ,
            successMessage: req.flash('err'),
        });


    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { 
            message: 'Failed to retrieve orders',
            error: error
        });
    }
}
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
        
const updateStatus = async (req,res )=>{
    try {
        const orderId = req.params.id;
        // console.log(orderId);
        const {orderStatus} =req.body;
        
   const validStatus = ["Pending","Processing","Shipped","Delivered","Cancel","ReturnRequest","Returned"];
   if(!validStatus.includes(orderStatus)){
    req.flash('err','not correct status code');
    res.redirect('/admin/orders');
   }

    const order = await Order.findById(orderId);
    if(!order){
        req.flash('err','Order not found');
        return res.redirect('/admin/order')
    }

    const  hasCanceledOrReturnedProduct = order.orderedItems.some(item=>
        item.status ==='Cancelled' || item.status === 'Returned'
    );

    if ( hasCanceledOrReturnedProduct) {
        req.flash('err', 'Cannot update status: Some products have been canceled or returned by the user.');
        return res.redirect(`/admin/orderdetail/${orderId}`);
    }





 const newOrderStatus =   await Order.findByIdAndUpdate(
          orderId,{$set:{status:orderStatus}},{new:true}
   );
   if (!newOrderStatus) {
    req.flash('err', 'Order not found');
    return res.redirect('/admin/order');
}
req.flash('err', 'Order status updated successfully');
     res.redirect('/admin/order')
        
    } catch (error) {
        console.error("error",error)
    }
};

module.exports={
    getOrder,
    getOrderDetails,
    updateStatus
}