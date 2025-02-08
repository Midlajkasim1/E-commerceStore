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
        amount: amount * 100, // Convert to paise
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

        // Coupon handling
    
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

        // If payment method is Razorpay, create order first
        if (paymentMethod === 'RAZORPAY') {
            console.log('Razorpay Order Details:', {
                finalAmount,
                orderId,
                discount
            });
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
// Add a new route to verify payment
const verifyPayment = async (req, res) => {
    try {
        const {
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature,
            orderId,
            addressId,
            discount
        } = req.body;

        const userId = req.session.user;

        // Verify signature
        const shasum = crypto.createHmac('sha256', razorpayInstance.key_secret);
        shasum.update(`${razorpayOrderId}|${razorpayPaymentId}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // Get cart details for order creation
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Calculate order amounts with discount
        const subtotal = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const shipping = 100;
        const tax = 20;
        const discountAmount = parseFloat(discount) || 0;
        const finalAmount = subtotal + shipping + tax - discountAmount;

        // Create ordered items array
        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            status: 'Processing'
        }));

        // Create order with discounted amount
        const order = new Order({
            orderId,
            userId,
            orderedItems,
            totalPrice: subtotal,
           
            discount: discountAmount,
            finalAmount,            
            shipping,
            tax,
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

        // Update product stock
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

        // Clear cart
        await Cart.findOneAndUpdate(
            { userId }, 
            { $set: { items: [] }},
            { new: true }
        );

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

    // Get product names from cart items, safely handling the product reference
    const productNames = cartItems.map(item => {
        // Check if productId exists and has a name property
        return item.productId && item.productId.name ? item.productId.name : 'Unknown Product';
    });
    
    // Create transaction record
    wallet.transaction.push({
        amount: amount,
        transactionId: uuidv4(),
        productName: productNames,
        type: 'debit',
        createdAt: new Date()
    });

    // Update wallet balance
    wallet.balance -= amount;
    await wallet.save();
    
    return true;
};
// const getWalletBalance = async (req, res) => {
//     try {
//         const userId = req.session.user;
//         const wallet = await Wallet.findOne({ user: userId });
        
//         return res.status(200).json({
//             success: true,
//             balance: wallet ? wallet.balance : 0
//         });
//     } catch (error) {
//         console.error('Error fetching wallet balance:', error);
//         return res.status(500).json({
//             success: false,
//             message: 'Failed to fetch wallet balance'
//         });
//     }
// };





















const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;  // This appears to be the ID string directly
        // console.log('Getting addresses for user ID:', userId);        
        const orders = await Order.find({ userId: userId })
            .populate('orderedItems.product')  // Ensure address is populated
            .sort({ createOn: -1 });
            console.log(orders);
            

        res.render('order', { 
            orders: orders,
            user: req.user || req.session.user  // Add this line explicitly

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

        // Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Find the specific product in the ordered items
        const productItem = order.orderedItems.find(item => item.product.toString() === productId);

        if (!productItem) {
            return res.status(404).json({ success: false, message: "Product not found in the order." });
        }

        // Check if the product is already canceled
        if (productItem.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: "Product is already canceled." });
        }

        const refundAmount = productItem.price * productItem.quantity;

         // Update the product stock
         const product = await Product.findById(productId);
         if (!product) {
             return res.status(404).json({ success: false, message: "Product not found." });
         }
         let refundResult = null;
       if(order.paymentMethod !== 'COD'){
         // Process refund to wallet
         refundResult = await handleRefund(
            userId,
            refundAmount,
            [product.name],
            orderId
        );
       }
        
        // Update the product status to 'Cancelled'
        productItem.status = 'Cancelled';
        productItem.cancellationReason = cancellationReason;

       
        const selectedSize = `size${productItem.size}`; // Convert size to the correct format (e.g., sizeM)
        if (product.size && product.size[selectedSize] !== undefined) {
            product.size[selectedSize] += productItem.quantity; // Restore stock
            product.quantity += productItem.quantity; // Restore total quantity
            await product.save();
        }

        // Update the overall order status based on the status of all products
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

        // Save the updated order
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
        const { productId, orderId } = req.body;
        const userId = req.session.user;


        if (!productId || !orderId) {
            return res.status(400).json({ success: false, message: "Order ID and Product ID are required." });
        }

        // Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Find the product in the ordered items
        const productItem = order.orderedItems.find(item => item.product.toString() === productId);

        if (!productItem) {
            return res.status(404).json({ success: false, message: "Product not found in the order." });
        }

        // Check if the product is already returned
        if (productItem.status === 'Returned') {
            return res.status(400).json({ success: false, message: "Product is already returned." });
        }

        const refundAmount = productItem.price * productItem.quantity;

            // Update the product stock
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({ success: false, message: "Product not found." });
            }


            
        // Process refund to wallet
        const refundResult = await handleRefund(
            userId,
            refundAmount,
            [product.name],
            orderId
        );

        // Update the product status to 'Returned'
        productItem.status = 'Returned';

    

        const selectedSize = `size${productItem.size}`; // Convert size to the correct format (e.g., sizeM)
        if (product.size && product.size[selectedSize] !== undefined) {
            product.size[selectedSize] += productItem.quantity; // Restore stock
            product.quantity += productItem.quantity; // Restore total quantity
            await product.save();
        }

        const allProducts = order.orderedItems;
        if (allProducts.every(item => item.status === "Delivered")) {
            order.status = "Delivered";
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

        return res.status(200).json({ success: true, message: "Product return request submitted successfully.", order });

    } catch (error) {
        console.error("Error while returning the product:", error);
        return res.status(500).json({ success: false, message: "An error occurred while returning the product." });
    }
};






module.exports = {
    placeOrder,
    verifyPayment,
    // getWalletBalance,
    handleWalletPayment,
    getOrderDetails,
    getOrderMoreDetails,
    cancelProductOrder,
    returnProductOrder,
    handleRefund 

};