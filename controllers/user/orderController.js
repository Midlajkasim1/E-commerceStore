const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
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
const cancelProductOrder = async (req, res) => {
    try {
        const { productId, orderId } = req.body;

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

        // Update the product status to 'Cancelled'
        productItem.status = 'Cancelled';

        // Update the product stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

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

        return res.status(200).json({ success: true, message: "Product canceled successfully.", order });

    } catch (error) {
        console.error("Error while canceling the product:", error);
        return res.status(500).json({ success: false, message: "An error occurred while canceling the product." });
    }
};

const returnProductOrder = async (req, res) => {
    try {
        const { productId, orderId } = req.body;

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

        // Update the product status to 'Returned'
        productItem.status = 'Returned';

        // Update the product stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

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
    getOrderDetails,
    getOrderMoreDetails,
    cancelProductOrder,
    returnProductOrder
};