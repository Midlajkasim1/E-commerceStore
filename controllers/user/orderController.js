const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Coupon = require('../../models/couponSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');



//razorpay
const razorpayInstance = new Razorpay({
    key_id:"rzp_test_ax31K21pHYTV8z",
    key_secret:"jZindVIE58oehKnqH45fY4sW"
})

const createRazorpayOrder = async (amount, receipt) => {
    return await razorpayInstance.orders.create({
        amount: amount * 100, 
        currency: 'INR',
        receipt: receipt,
        payment_capture: 1
    });
};


const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod  } = req.body;
        let {discount =0} =req.body;
        const userId = req.session.user;

        if (!userId || !addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required information'
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

    
        const user = await User.findById(userId);
        if (user && user.redeemedUser) {
            const coupon = await Coupon.findById(user.redeemedUser);
            if (coupon) {
                discount = coupon.offerPrice;
                if (!coupon.usedUsers.includes(userId)) {
                    coupon.usedUsers.push(userId);
                    await coupon.save();
                }
                user.redeemedUser = null;
                await user.save();
            }
        }

        const subtotal = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const shipping = 100;
        const tax = 20;
        const finalAmount = subtotal + shipping + tax - discount;







        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size
        }));

        const orderId = uuidv4();

        if (paymentMethod === 'RAZORPAY') {
            req.session.orderDetails = {
                orderId,
                discount,
                subtotal,
                shipping,
                tax,
                finalAmount
            };

            const razorpayOrder = await createRazorpayOrder(finalAmount, orderId);
            console.log('Razorpay Response:', razorpayOrder);

            return res.status(200).json({
                success: true,
                orderId,
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                key: razorpayInstance.key_id,
                discount
            });
        }

        if (paymentMethod === 'WALLET') {
            try {
                await handleWalletPayment(userId, finalAmount, cart.items);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
        }





        const order = new Order({
            orderId,
            userId,
            orderedItems,
            totalPrice: subtotal,
            discount,
            shipping,
            tax,
            finalAmount,
            address: addressId,
            status: paymentMethod === 'COD' ? 'Pending' : 'Processing',
            paymentMethod,
            createOn: new Date()
        });

        await order.save();

              for (const item of cart.items) {
                const product = await Product.findById(item.productId._id);
                if (!product) {
                    return res.status(400).json({
                        success: false,
                        message: `Product ${item.productId._id} not found`
                    });
                }
    
                const selectedSize = `size${item.size}`;
    
                if (!product.size || typeof product.size[selectedSize] === 'undefined' || product.size[selectedSize] < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `${product.name} in size ${item.size} is out of stock`
                    });
                }
    
                const updateObj = {
                    $inc: {
                        [`size.${selectedSize}`]: -item.quantity,
                        quantity: -item.quantity
                    }
                };
    
                const updatedProduct = await Product.findByIdAndUpdate(
                    product._id,
                    updateObj,
                    { new: true }
                );
    
                if (!updatedProduct) {
                    return res.status(400).json({
                        success: false,
                        message: `Failed to update stock for ${product.name}`
                    });
                }
            }
        await Cart.findOneAndUpdate({ userId }, { $set: { items: [] }}, { new: true });

        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: orderId
        });

    } catch (error) {
        console.error('Order placement error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
};
//
const verifyPayment = async (req, res) => {
    try {
        const {
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature,
            orderId,
            addressId,
            // discount
        } = req.body;

        const userId = req.session.user;
        const orderDetails = req.session.orderDetails;
        if (!orderDetails) {
            return res.status(400).json({
                success: false,
                message: 'Order details not found'
            });
        }

        const shasum = crypto.createHmac('sha256', razorpayInstance.key_secret);
        shasum.update(`${razorpayOrderId}|${razorpayPaymentId}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // const subtotal = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        // const shipping = 100;
        // const tax = 20;
        // const discountAmount = parseFloat(discount) || 0;
        // const finalAmount = subtotal + shipping + tax - discountAmount;

        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            status: 'Processing'
        }));

        const order = new Order({
            orderId,
            userId,
            orderedItems,
            totalPrice: orderDetails.subtotal,
            discount: orderDetails.discount,
            shipping: orderDetails.shipping,
            tax: orderDetails.tax,
            finalAmount: orderDetails.finalAmount,
            address: addressId,
            status: 'Processing',
            paymentMethod: 'RAZORPAY',
            paymentDetails: {
                razorpayPaymentId,
                razorpayOrderId,
                razorpaySignature
            },
            createOn: new Date()
        });
        
        await order.save();

        for (const item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (product) {
                const selectedSize = `size${item.size}`;
                const updateObj = {
                    $inc: {
                        [`size.${selectedSize}`]: -item.quantity,
                        quantity: -item.quantity
                    }
                };
                await Product.findByIdAndUpdate(product._id, updateObj);
            }
        }

        await Cart.findOneAndUpdate(
            { userId }, 
            { $set: { items: [] }},
            { new: true }
        );
        delete req.session.orderDetails;
        return res.status(200).json({
            success: true,
            message: 'Payment verified and order placed successfully',
            orderId: order.orderId
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Payment verification failed: ' + error.message
        });
    }
};
//wallet payment

const handleWalletPayment = async (userId, amount, cartItems) => {
    const wallet = await Wallet.findOne({ user: userId });
    
    if (!wallet || wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
    }

    const productNames = cartItems.map(item => {
        return item.productId && item.productId.name ? item.productId.name : 'Unknown Product';
    });
    
    wallet.transaction.push({
        amount: amount,
        transactionId: uuidv4(),
        productName: productNames,
        type: 'debit',
        createdAt: new Date()
    });

    wallet.balance -= amount;
    await wallet.save();
    
    return true;
};

//get order details
const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;  
        const orders = await Order.find({ userId: userId })
            .populate('orderedItems.product')  
            .sort({ createOn: -1 });
            console.log(orders);
            

        res.render('order', { 
            orders: orders,
            user: req.user || req.session.user  

        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.redirect('/pageNotFound');
    }
};


const getOrderMoreDetails = async (req, res) => {
    try {
        const userId = req.session.user;

        const orderId = req.params.id;
        console.log("order id is :",orderId);
        const orders = await Order.findById(orderId).populate('orderedItems.product') ;


        // console.log('address id is ',orders.address);
        const address = await Address.findOne({
            "address._id": orders.address,  
          });
        //   console.log('new addr',address)

          let selectedAddress;

    if (address) {
      selectedAddress = address.address.find((value) => value._id.toString() === orders.address.toString());
    //   console.log("Matched Address:", selectedAddress);
      return res.render('viewOrderDetails',{
        user: req.user || req.session.user ,
        order:orders,
        address:selectedAddress,
        message:req.flash('err')

      })


    } else {
      console.log("No address found");
    }
    console.log(orders)
        
    }catch{
       
        res.status(500).send('server error');
         
    }
}


const handleRefund = async (userId, amount, productNames, orderId) => {
    try {
        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transaction: []
            });
        }

        const transactionId = uuidv4();
        wallet.transaction.push({
            amount: amount,
            transactionId: transactionId,
            productName: productNames,
            type: 'credit',
            createdAt: new Date()
        });

        wallet.balance += amount;
        await wallet.save();

        return { success: true, transactionId: transactionId };
    } catch (error) {
        console.error('Wallet refund error:', error);
        throw error;
    }
};


const cancelProductOrder = async (req, res) => {
    try {
        const { productId, orderId, cancellationReason  } = req.body;
        const userId = req.session.user;

        if (!productId || !orderId) {
            return res.status(400).json({ success: false, message: "Order ID and Product ID are required." });
        }

    
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const productItem = order.orderedItems.find(item => item.product.toString() === productId);

        if (!productItem) {
            return res.status(404).json({ success: false, message: "Product not found in the order." });
        }

        if (productItem.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: "Product is already canceled." });
        }

        const refundAmount = productItem.price * productItem.quantity;

         const product = await Product.findById(productId);
         if (!product) {
             return res.status(404).json({ success: false, message: "Product not found." });
         }
         let refundResult = null;
       if(order.paymentMethod !== 'COD'){
         refundResult = await handleRefund(
            userId,
            refundAmount,
            [product.name],
            orderId
        );
       }
        
        productItem.status = 'Cancelled';
        productItem.cancellationReason = cancellationReason;

       
        const selectedSize = `size${productItem.size}`; 
        if (product.size && product.size[selectedSize] !== undefined) {
            product.size[selectedSize] += productItem.quantity; 
            product.quantity += productItem.quantity;
            await product.save();
        }

        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === "Delivered")) {
            order.status = "Delivered";
        } else if (allProducts.some(item => item.status === "Shipped")) {
            order.status = "Shipped";
        } else if (allProducts.some(item => item.status === "Processing")) {
            order.status = "Processing";
        } else if (allProducts.every(item => item.status === "Cancelled")) {
            order.status = "Cancelled";
        } else if (allProducts.some(item => item.status === "Returned")) {
            order.status = "Returned";
        } else {
            order.status = "Pending";
        }

        await order.save();

        const response = {
            success: true,
            message: order.paymentMethod === 'COD' 
                ? "Product canceled successfully. No refund processed for Cash on Delivery orders."
                : "Product canceled successfully and refund processed to wallet.",
            order
        };

        if (refundResult) {
            response.refundTransactionId = refundResult.transactionId;
        }
        return res.status(200).json(response);


    } catch (error) {
        console.error("Error while canceling the product:", error);
        return res.status(500).json({ success: false, message: "An error occurred while canceling the product." });
    }
};

const returnProductOrder = async (req, res) => {
    try {
        const { productId, orderId, returnReason } = req.body;
        const userId = req.session.user;

        if (!productId || !orderId || !returnReason) {
            return res.status(400).json({ 
                success: false, 
                message: "Order ID, Product ID, and return reason are required." 
            });
        }

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        const productItem = order.orderedItems.find(item => 
            item.product.toString() === productId
        );

        if (!productItem) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found in the order." 
            });
        }

        // Check if product is eligible for return
        if (productItem.status !== 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: "Only delivered products can be returned." 
            });
        }

        if (productItem.status === 'Return Request') {
            return res.status(400).json({ 
                success: false, 
                message: "Return request already submitted for this product." 
            });
        }

        if (productItem.status === 'Returned') {
            return res.status(400).json({ 
                success: false, 
                message: "Product is already returned." 
            });
        }
        if (['Return Request', 'Returned'].includes(productItem.status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Product is already in ${productItem.status} status.` 
            });
        }


        // Update product item status to Return Request
        productItem.status = 'Return Request';
        productItem.returnReason = returnReason;
        productItem.returnRequestDate = new Date();

        const statusCounts = order.orderedItems.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});

        // Update order status based on all products
        if (statusCounts['Processing'] > 0) {
            order.status = 'Processing';
        } else if (statusCounts['Shipped'] > 0) {
            order.status = 'Shipped';
        } else if (statusCounts['Return Request'] > 0 && statusCounts['Delivered'] > 0) {
            order.status = 'Partially Returned';
        } else if (statusCounts['Return Request'] === order.orderedItems.length) {
            order.status = 'Return Request';
        } else if (statusCounts['Returned'] === order.orderedItems.length) {
            order.status = 'Returned';
        } else if (statusCounts['Delivered'] === order.orderedItems.length) {
            order.status = 'Delivered';
        }

        await order.save();

        return res.status(200).json({ 
            success: true, 
            message: "Return request submitted successfully. Please wait for admin approval.", 
            order 
        });
    } catch (error) {
        console.error("Error while submitting return request:", error);
        return res.status(500).json({ 
            success: false, 
            message: "An error occurred while submitting the return request." 
        });
    }
};



module.exports = {
    placeOrder,
    verifyPayment,
    handleWalletPayment,
    getOrderDetails,
    getOrderMoreDetails,
    cancelProductOrder,
    returnProductOrder,
    handleRefund 

};