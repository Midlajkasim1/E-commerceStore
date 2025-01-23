const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const { v4: uuidv4 } = require('uuid');

const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
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

        // Check stock availability and update stock
        for (const item of cart.items) {
            const product = await Product.findById(item.productId._id);
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: `Product ${item.productId._id} not found`
                });
            }

            const selectedSize = `size${item.size}`; // Convert M to sizeM format

            // Check if size exists and has sufficient stock
            if (!product.size || typeof product.size[selectedSize] === 'undefined' || product.size[selectedSize] < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `${product.name} in size ${item.size} is out of stock`
                });
            }

            // Create update object with the correct size key
            const updateObj = {
                $inc: {
                    [`size.${selectedSize}`]: -item.quantity,
                    quantity: -item.quantity
                }
            };

            // Update stock
            const updatedProduct = await Product.findByIdAndUpdate(
                product._id,
                updateObj,
                { new: true } // This returns the updated document
            );

            if (!updatedProduct) {
                return res.status(400).json({
                    success: false,
                    message: `Failed to update stock for ${product.name}`
                });
            }
        }

        const orderedItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size
        }));

        const subtotal = cart.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const shipping = 100;
        const tax = 20;
        const finalAmount = subtotal + shipping + tax;

        const orderId = uuidv4();
        const order = new Order({
            orderId,
            userId,
            orderedItems,
            totalPrice: subtotal,
            shipping,
            tax,
            finalAmount,
            address: addressId,
            status: 'Pending',
            paymentMethod,
            createOn: new Date()
        });

        await order.save();
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

const getOrderDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        
        const orders = await Order.find({ userId })
            .populate({
                path: 'orderedItems.product',
                model: 'Product',
                select: 'name images price size'  // Explicitly select fields
            })
            .populate('address')  // Ensure address is populated
            .sort({ createOn: -1 });

        res.render('order', { 
            orders: orders.map(order => ({
                ...order.toObject(),
                formattedDate: order.createOn.toLocaleDateString(),
                statusClass: getStatusClass(order.status)
            }))
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.redirect('/pageNotFound');
    }
};
// Helper function to map status to CSS class
const getStatusClass = (status) => {
    const statusMap = {
        'Pending': 'bg-warning',
        'Processing': 'bg-info',
        'Shipped': 'bg-primary',
        'Delivered': 'bg-success',
        'Cancel': 'bg-danger',
        'Return Request': 'bg-secondary',
        'Returned': 'bg-dark'
    };
    return statusMap[status] || 'bg-secondary';
};

module.exports = {
    placeOrder,
    getOrderDetails
};