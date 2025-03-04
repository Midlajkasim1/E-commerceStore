const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const ProductVariant = require('../../models/productVariantSchema')
const Address = require('../../models/addressSchema');
const Coupon = require('../../models/couponSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const env = require('dotenv').config();




//razorpay
const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

const createRazorpayOrder = async (amount, receipt) => {
    try {
        if (!amount || !receipt) {
            throw new Error('Amount and receipt are required');
        }

        const amountInPaise = Math.round(parseFloat(amount) * 100);

        if (isNaN(amountInPaise) || amountInPaise <= 0) {
            throw new Error('Invalid amount value');
        }

        const order = await razorpayInstance.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: receipt.toString(),
            payment_capture: 1
        });

        if (!order || !order.id) {
            throw new Error('Failed to create Razorpay order');
        }

        return order;
    } catch (error) {
        console.error('Razorpay order creation error:', error);
        throw new Error(`Failed to create payment order: ${error.message}`);
    }
};

const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        let { discount = 0 } = req.body;
        const userId = req.session.user;

        if (!userId || !addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required information'
            });
        }

        const addressDoc = await Address.findOne({
            userId,
            "address._id": addressId
        });

        if (!addressDoc) {
            return res.status(400).json({
                success: false,
                message: 'Shipping address not found'
            });
        }

        const shippingAddress = addressDoc.address.find(
            addr => addr._id.toString() === addressId
        );

        if (!shippingAddress) {
            return res.status(400).json({
                success: false,
                message: 'Shipping address not found'
            });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId items.variantId');

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        for (const item of cart.items) {
            const variant = await ProductVariant.findById(item.variantId);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Product variant not found for ${item.productId.productName}`
                });
            }

            if (variant.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.productId.productName} in size ${variant.size}`
                });
            }
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
        const taxRate = 0.02;
        const tax = subtotal * taxRate;
        const shipping = subtotal >= 2000 ? 0 : 100;
        const finalAmount = subtotal + shipping + tax - discount;

        if (paymentMethod === 'COD' && finalAmount > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Cash on Delivery is not available for orders above Rs 1000. Please choose a different payment method.'
            });
        }

        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            variant: item.variantId._id, 
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            status: 'Pending'
        }));

        const orderId = uuidv4();

        const order = new Order({
            orderId,
            userId,
            orderedItems,
            totalPrice: subtotal,
            discount,
            shipping,
            tax,
            finalAmount,
            shippingAddress: {
                addressType: shippingAddress.addressType,
                name: shippingAddress.name,
                city: shippingAddress.city,
                landMark: shippingAddress.landMark,
                state: shippingAddress.state,
                pincode: shippingAddress.pincode,
                phone: shippingAddress.phone,
                altPhone: shippingAddress.altPhone
            },
            address: addressDoc._id,
            status: 'Pending',
            paymentMethod,
            paymentStatus: paymentMethod === 'RAZORPAY' ? 'pending' : 'not_applicable',
            createOn: new Date()
        });

        await order.save();

        if (paymentMethod === 'RAZORPAY') {
            req.session.orderDetails = {
                orderId,
                discount,
                subtotal,
                shipping,
                tax,
                finalAmount,
                shippingAddress,
                address: addressDoc._id
            };

            if (isNaN(finalAmount) || finalAmount <= 0) {
                throw new Error('Invalid amount for payment');
            }
            const razorpayOrder = await createRazorpayOrder(finalAmount, orderId);

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
                order.status = 'Pending';
                order.paymentStatus = 'completed';
                await order.save();
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
        }


        if (order.status !== 'Payment Failed') {
            for (const item of cart.items) {
                const variant = await ProductVariant.findById(item.variantId);
                if (!variant) {
                    return res.status(400).json({
                        success: false,
                        message: `Product variant not found`
                    });
                }

                if (variant.quantity < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${item.productId.productName} in ${variant.color} color and size ${variant.size}`
                    });
                }

                variant.quantity -= item.quantity;
                await variant.save();

                const product = await Product.findById(item.productId);
                const allVariants = await ProductVariant.find({ productId: item.productId });
                const totalQuantity = allVariants.reduce((sum, variant) => sum + variant.quantity, 0);
                
                if (totalQuantity === 0) {
                    product.status = "out of stock";
                    await product.save();
                }
            }

            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [] } },
                { new: true }
            );
        }


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

        const existingOrder = await Order.findOne({ orderId });
        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (digest !== razorpaySignature) {
            existingOrder.status = 'failed';
            existingOrder.paymentStatus = 'failed';
            existingOrder.paymentDetails = {
                razorpayPaymentId,
                razorpayOrderId,
                razorpaySignature
            };
            await existingOrder.save();

            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        existingOrder.status = 'Pending';
        existingOrder.paymentStatus = 'completed';
        existingOrder.paymentDetails = {
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature
        };

        existingOrder.orderedItems = existingOrder.orderedItems.map(item => ({
            ...item,
            status: 'Pending'
        }));

        await existingOrder.save();

        for (const item of existingOrder.orderedItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                throw new Error(`Product ${item.product} not found`);
            }

            if (!product.hasVariants) {
                throw new Error(`Product ${product.productName} does not support variants`);
            }

            const variant = await ProductVariant.findOne({
                productId: item.product,
                size: item.size,
                isActive: true
            });

            if (!variant) {
                throw new Error(`Variant not found for product ${product.productName} in size ${item.size}`);
            }

            if (variant.quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${product.productName} in size ${item.size}`);
            }

            variant.quantity -= item.quantity;
            await variant.save();

            const allVariants = await ProductVariant.find({
                productId: item.product,
                isActive: true
            });

            const totalQuantity = allVariants.reduce((sum, v) => sum + v.quantity, 0);
            
            if (totalQuantity === 0) {
                product.status = "out of stock";
                await product.save();
            }
        }

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId },
            {
                status: 'Pending',
                paymentStatus: 'completed',
                paymentDetails: {
                    razorpayPaymentId,
                    razorpayOrderId,
                    razorpaySignature
                }
            },
            { new: true }
        );

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { new: true }
        );

        delete req.session.orderDetails;


        return res.status(200).json({
            success: true,
            message: 'Payment verified and order updated successfully',
            orderId: existingOrder.orderId,
            redirect: `/profile/order`
        });

    } catch (error){
        console.error('Payment verification error:', error);

        if (req.body.orderId) {
            const order = await Order.findOne({ orderId: req.body.orderId })
                .populate('orderedItems.product');
            
            if (order) {
                for (const item of order.orderedItems) {
                    const variant = await ProductVariant.findOne({
                        productId: item.product,
                        size: item.size,
                        isActive: true
                    });

                    if (variant) {
                        variant.quantity += item.quantity;
                        await variant.save();

                        const product = await Product.findById(item.product);
                        if (product && product.status === "out of stock" && variant.quantity > 0) {
                            product.status = "Available";
                            await product.save();
                        }
                    }
                }
            }
        }

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
        return item.productId && item.productId.productName ? item.productId.productName : 'Unknown Product';
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

//payment failed
const handleFailedPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log("Received orderId:", orderId);

        const userId = req.session.user;

        if (!orderId) {
            return res.render('payment-failed', {
                orderId: 'N/A',
                totalAmount: 0,
                paymentMethod: 'N/A',
                id: 'N/A',
                error: 'Order ID is required'
            });
        }

        const order = await Order.findOne({
            orderId: orderId,
            userId: userId
        }).populate('orderedItems.product address');

        const orderDetails = req.session.orderDetails;


        let finalAmount = 0;
        let paymentMethod = 'N/A';
        let id = userId;

        if (order) {
            finalAmount = order.finalAmount;
            paymentMethod = order.paymentMethod;
            id = order._id;

            if (order.status !== 'failed') {
                order.status = 'failed';
                await order.save();
            }
        } else if (orderDetails) {
            finalAmount = orderDetails.finalAmount;
            paymentMethod = 'RAZORPAY';
            id = orderDetails.orderId;
        }

        finalAmount = Number(finalAmount) || 0;
        delete req.session.orderDetails;
        res.render('payment-failed', {
            orderId: orderId,
            totalAmount: finalAmount,
            paymentMethod: paymentMethod,
            id: id,
            error: req.query.error || 'Your payment was not successful. You can try again or choose a different payment method.'
        });

    } catch (error) {
        console.error('Error handling failed payment:', error);
        res.render('payment-failed', {
            orderId: req.params.orderId || 'N/A',
            totalAmount: 0,
            paymentMethod: 'N/A',
            id: 'N/A',
            error: 'An unexpected error occurred while processing your payment. Please try again later.'
        });
    }
};

const retryPayment = async (req, res) => {
    try {
        const { totalAmount, orderId } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        if (!totalAmount || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: totalAmount and orderId'
            });
        }

        const amount = parseFloat(totalAmount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount value'
            });
        }

        const existingOrder = await Order.findOne({
            orderId: orderId,
            userId: userId
        });

        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (existingOrder.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Payment already completed for this order'
            });
        }

        const razorpayOrder = await createRazorpayOrder(amount, orderId);

        req.session.orderDetails = {
            orderId: orderId,
            finalAmount: amount,
            discount: existingOrder.discount,
            subtotal: existingOrder.totalPrice,
            shipping: existingOrder.shipping,
            tax: existingOrder.tax,
            shippingAddress: existingOrder.shippingAddress,
            address: existingOrder.address
        };

        await Order.findOneAndUpdate(
            { orderId: orderId },
            {
                status: 'Pending',
                paymentStatus: 'pending'
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            orderId: orderId,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            key: razorpayInstance.key_id,
            currency: 'INR'
        });

    } catch (error) {
        console.error('Error in retry payment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while processing retry payment',
            error: error.message
        });
    }
};

const verifyRetryPayment = async (req, res) => {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            orderId,
        } = req.body;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification details'
            });
        }

        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const generated_signature = crypto
            .createHmac('sha256', razorpayInstance.key_secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        const order = await Order.findOne({ orderId, userId })
            .populate({
                path: 'orderedItems.product',
                select: 'productName status hasVariants'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.paymentStatus === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Payment already completed for this order'
            });
        }

        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                throw new Error(`Product ${item.product} not found`);
            }

            if (!product.hasVariants) {
                throw new Error(`Product ${product.productName} does not support variants`);
            }

            const variant = await ProductVariant.findOne({
                productId: item.product,
                size: item.size,
                isActive: true
            });

            if (!variant) {
                throw new Error(`Variant not found for product ${product.productName} in size ${item.size}`);
            }

            if (variant.quantity < item.quantity) {
                throw new Error(`Insufficient stock for ${product.productName} in size ${item.size}`);
            }

            variant.quantity -= item.quantity;
            await variant.save();

            const allVariants = await ProductVariant.find({
                productId: item.product,
                isActive: true
            });

            const totalQuantity = allVariants.reduce((sum, v) => sum + v.quantity, 0);
            
            if (totalQuantity === 0) {
                product.status = "out of stock";
                await product.save();
            }
        }

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId },
            {
                status: 'Pending',
                paymentStatus: 'completed',
                paymentDetails: {
                    razorpayPaymentId: razorpay_payment_id,
                    razorpayOrderId: razorpay_order_id,
                    razorpaySignature: razorpay_signature
                }
            },
            { new: true }
        );

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { new: true }
        );

        if (req.session.orderDetails) {
            delete req.session.orderDetails;
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verified and order processed successfully',
            order: {
                orderId: updatedOrder.orderId,
                status: updatedOrder.status
            }
        });

    } catch (error) {
        console.error('Payment verification error:', error);

        if (req.body.orderId) {
            const order = await Order.findOne({ orderId: req.body.orderId })
                .populate('orderedItems.product');
            
            if (order) {
                for (const item of order.orderedItems) {
                    const variant = await ProductVariant.findOne({
                        productId: item.product,
                        size: item.size,
                        isActive: true
                    });

                    if (variant) {
                        variant.quantity += item.quantity;
                        await variant.save();

                        const product = await Product.findById(item.product);
                        if (product && product.status === "out of stock" && variant.quantity > 0) {
                            product.status = "Available";
                            await product.save();
                        }
                    }
                }
            }
        }

        return res.status(500).json({
            success: false,
            message: 'Payment verification failed: ' + error.message
        });
    }
};


//get order details
const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1; 
        const limit = 5; 
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments({ userId: userId });
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find({ userId: userId })
            .populate('orderedItems.product')
            .sort({ createOn: -1 })
            .skip(skip)
            .limit(limit);
  
        res.render('order', {
            orders: orders,
            user: req.user || req.session.user,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            lastPage: totalPages
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        res.redirect('/pageNotFound');
    }
};


const getOrderMoreDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const orderId = req.params.id;

        const order = await Order.findById(orderId).populate('orderedItems.product');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        return res.render('viewOrderDetails', {
            user: req.user || req.session.user,
            order: order,
            address: order.shippingAddress,
            message: req.flash('err')
        });

    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).send('Server error');
    }
};



const generateInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const order = await Order.findById(orderId)
            .populate({
                path: 'orderedItems.product',
                select: 'productName price'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${order.orderId}.pdf`);
        doc.pipe(res);

        doc.fontSize(20)
            .text('Urban Row', { align: 'center' })
            .moveDown()
            .fontSize(16)
            .text('INVOICE', { align: 'center' })
            .moveDown();

        doc.fontSize(10)
            .text(`Order ID: ${order.orderId}`, { align: 'right' })
            .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
            .moveDown();

        doc.fontSize(10)
            .text('SHIPPING ADDRESS:', { underline: true })
            .text(order.shippingAddress?.name)
            .text(order.shippingAddress?.landMark)
            .text(`${order.shippingAddress?.city}, ${order.shippingAddress?.state}`)
            .text(order.shippingAddress?.pincode)
            .text(order.shippingAddress?.phone)
            .moveDown();

        const tableTop = doc.y + 10;
        const tableHeaders = ['Product', 'Size', 'Qty', 'Price', 'Total'];
        const columnWidths = [240, 60, 60, 80, 80];
        let xPosition = 50;

        doc.fillColor('#f0f0f0')
            .rect(xPosition, tableTop, 520, 20)
            .fill();

        doc.fillColor('#000000');
        tableHeaders.forEach((header, i) => {
            doc.text(header, xPosition, tableTop + 5, {
                width: columnWidths[i],
                align: i === 0 ? 'left' : 'right'
            });
            xPosition += columnWidths[i];
        });

        let y = tableTop + 25;
        if (Array.isArray(order.orderedItems)) {
            order.orderedItems.forEach((item, index) => {
                const price = Number(item.price) || 0;
                const quantity = Number(item.quantity) || 0;
                const total = price * quantity;

                if (index % 2 === 1) {
                    doc.fillColor('#f9f9f9')
                        .rect(50, y - 5, 520, 20)
                        .fill();
                    doc.fillColor('#000000');
                }

                xPosition = 50;
                doc.text(item.product?.productName || '', xPosition, y, { width: columnWidths[0] });
                xPosition += columnWidths[0];

                doc.text(item.size || '', xPosition, y, { width: columnWidths[1], align: 'right' });
                xPosition += columnWidths[1];

                doc.text(quantity.toString(), xPosition, y, { width: columnWidths[2], align: 'right' });
                xPosition += columnWidths[2];

                doc.text(price.toString(), xPosition, y, { width: columnWidths[3], align: 'right' });
                xPosition += columnWidths[3];

                doc.text(total.toString(), xPosition, y, { width: columnWidths[4], align: 'right' });

                y += 20;
            });
        }

        doc.moveTo(50, y)
            .lineTo(570, y)
            .stroke();

        y += 20;
        const summaryX = 400;
        const totalPrice = Number(order.totalPrice) || 0;
        const discount = Number(order.discount) || 0;
        const shipping = Number(order.shipping) || 0;
        const finalAmount = Number(order.finalAmount) || 0;

        doc.text('Subtotal', summaryX, y)
            .text(totalPrice.toString(), summaryX + 100, y, { align: 'right' });

        if (discount > 0) {
            y += 20;
            doc.text('Discount', summaryX, y)
                .text(`-${discount.toString()}`, summaryX + 100, y, { align: 'right' });
        }

        y += 20;
        doc.text('Shipping', summaryX, y)
            .text(shipping.toString(), summaryX + 100, y, { align: 'right' });

        y += 20;
        doc.fontSize(12)
            .text('Grand Total', summaryX, y, { bold: true })
            .text(finalAmount.toString(), summaryX + 100, y, { align: 'right', bold: true });

        doc.fontSize(10)
            .text('        Thank you for shopping with Urban Row!', {
                align: 'center',
                y: 700
            });

        doc.end();

    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate invoice'
        });
    }
};

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
        const { productId, orderId, cancellationReason } = req.body;
        const userId = req.session.user;

        if (!productId || !orderId) {
            return res.status(400).json({ success: false, message: "Order ID and Product ID are required." });
        }

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        const itemIndex = req.body.itemIndex;

        let productItem;

        if (itemIndex !== undefined) {
            productItem = order.orderedItems[itemIndex];
        } else {
            productItem = order.orderedItems.find(item =>
                item.product.toString() === productId && item.status !== 'Cancelled'
            );
        }

        if (!productItem) {
            return res.status(404).json({ success: false, message: "Product not found in the order or already cancelled." });
        }

        if (productItem.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: "Product is already canceled." });
        }

        const itemAmount = productItem.price * productItem.quantity;

        const remainingItems = order.orderedItems.filter(item => 
            item.status !== 'Cancelled' && 
            !(item.product.toString() === productItem.product.toString() && 
              item._id.toString() === productItem._id.toString())
        );

        const remainingSubtotal = remainingItems.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0);

        let refundAmount = itemAmount;
        let couponAdjustment = 0;
        
        const hasPreviousCancellations = order.orderedItems.some(item => 
            item.status === 'Cancelled'
        );
      
        if (order.discount > 0 && !hasPreviousCancellations) {
            try {
                const user = await User.findById(userId);
                let couponMinimumPrice = 0;
                
                if (user && user.redeemedUser) {
                    const coupon = await Coupon.findById(user.redeemedUser);
                    if (coupon) {
                        couponMinimumPrice = coupon.minimumPrice;
                    }
                } else {
                    const coupons = await Coupon.find({ usedUsers: userId });
                    if (coupons.length > 0) {
                        couponMinimumPrice = coupons[0].minimumPrice;
                    } 
                }

                if (remainingItems.length === 0) {
                    if (order.orderedItems.length > 1) {
                        const orderSubtotal = order.totalPrice;
                        const itemPercentage = itemAmount / orderSubtotal;
                        couponAdjustment = order.discount * itemPercentage;
                        refundAmount = itemAmount - couponAdjustment;
                    } else {
                        refundAmount = order.finalAmount;
                    }
                } 
                else if (remainingSubtotal < couponMinimumPrice) {
                    couponAdjustment = order.discount;
                    refundAmount = itemAmount - couponAdjustment;
                    
                    if (refundAmount < 0) {
                        refundAmount = 0;
                    }
                }
            } catch (error) {
                console.error("Error retrieving coupon information:", error);
                if (remainingItems.length > 0) {
                    couponAdjustment = order.discount;
                    refundAmount = itemAmount - couponAdjustment;
                    if (refundAmount < 0) refundAmount = 0;
                }
            }
        }

        const variant = await ProductVariant.findById(productItem.variant);
        if (variant) {
            variant.quantity += productItem.quantity;
            await variant.save();

            const product = await Product.findById(productId);
            if (product && product.status === "out of stock") {
                product.status = "Available";
                await product.save();
            }
        }

        let refundResult = null;
        if (order.paymentMethod !== 'COD' && refundAmount > 0) {
            refundResult = await handleRefund(
                userId,
                refundAmount,
                [productItem.productName || 'Canceled Product'],
                orderId
            );
        }

        productItem.status = 'Cancelled';
        productItem.cancellationReason = cancellationReason;

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

        if (couponAdjustment > 0) {
        }

        await order.save();

        let message;
        if (order.paymentMethod === 'COD') {
            message = "Product canceled successfully. No refund processed for Cash on Delivery orders.";
        } else if (refundAmount <= 0) {
            message = "Product canceled successfully. No refund processed as the coupon discount exceeded the item value.";
        } else {
            message = `Product canceled successfully. Refund of ₹${refundAmount} processed to wallet${couponAdjustment > 0 ? ` (coupon discount of ₹${couponAdjustment} was deducted)` : ''}.`;
        }

        const response = {
            success: true,
            message: message,
            order: {
                id: order._id,
                orderId: order.orderId,
                status: order.status
            }
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

        if (productItem.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: "Only delivered products can be returned."
            });
        }
        const deliveryDate = productItem.deliveredDate || order.deliveredAt || order.createOn;
        if(!deliveryDate){
            return res.status(400).json({
                success:false,
                message:"Delivery date not found for this product."
            })
        }

        const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
        if (daysSinceDelivery > 7) {
            return res.status(400).json({
                success: false,
                message: "Return window has expired. Products can only be returned within 7 days of delivery."
            });
        }

        
        if (['Return Request', 'Returned'].includes(productItem.status)) {
            return res.status(400).json({
                success: false,
                message: `Product is already in ${productItem.status} status.`
            });
        }


        productItem.status = 'Return Request';
        productItem.returnReason = returnReason;
        productItem.returnRequestDate = new Date();

        const statusCounts = order.orderedItems.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});

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
    handleFailedPayment,
    retryPayment,
    verifyRetryPayment,
    getOrderDetails,
    getOrderMoreDetails,
    generateInvoice,
    cancelProductOrder,
    returnProductOrder,
    handleRefund

};