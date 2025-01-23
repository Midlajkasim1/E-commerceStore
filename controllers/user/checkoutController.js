const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');




const getCheckout = async (req, res) => {
    try {
        // Get user's addresses
        const userAddress = await Address.findOne({ userId: req.session.user });
        
        // Get cart items
        const userCart = await Cart.findOne({ userId: req.session.user })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice productImage'
            });

        if (!userCart) {
            return res.redirect('/cart');
        }

        const cartItems = userCart.items.map(item => ({
            productId: item.productId._id,
            productName: item.productId.productName,
            productImage: item.productId.productImage,
            quantity: item.quantity,
            size: item.size,
            price: item.price,
            salePrice: item.productId.salePrice,
            totalPrice: item.totalPrice,
        }));

        const subtotal = cartItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const shipping = 100;
        const tax = 20;
        const total = subtotal + shipping + tax;

        res.render('checkout', {
            addresses: userAddress ? userAddress.address : [],
            cartItems,
            subtotal,
            shipping,
            tax,
            total,
            user: req.session.user
        });

    } catch (error) {
        console.error("Error in getCheckout:", error);
        res.redirect('/cart');
    }
};

const checkoutAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;  // Use the ID string directly
        console.log('Adding address for user ID:', userId);

        const {addressType, name, phone, altPhone, landMark, city, state, pincode} = req.body;
        console.log('Address data to save:', {
            userId,
            addressType,
            name,
            phone,
            altPhone,
            landMark,
            city,
            state,
            pincode
        });

        let userAddress = await Address.findOne({ userId: userId });
        console.log('Existing address found:', userAddress);

        if (!userAddress) {
            userAddress = new Address({
                userId: userId,  // Use the ID string
                address: [{
                    addressType, 
                    name, 
                    phone, 
                    altPhone, 
                    landMark, 
                    city, 
                    state, 
                    pincode
                }]
            });
            console.log('Created new address document:', userAddress);
        } else {
            userAddress.address.push({
                addressType, 
                name, 
                phone, 
                altPhone, 
                landMark, 
                city, 
                state, 
                pincode
            });
            console.log('Added to existing address document:', userAddress);
        }
        
        const savedAddress = await userAddress.save();
        console.log('Successfully saved address:', savedAddress);

        return res.status(200).json({
            success: true,
            message: 'Address added successfully'
        });
    } catch (error) {
        console.error('Error adding address:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add address. Please try again.'
        });
    }
}


//
const checkOuteditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.body.addressId; // Changed from req.query.id to req.body.addressId
        const userId = req.session.user._id;

        console.log('Debug Info:', {
            addressId,
            userId,
            data
        });

        // Find the address document
        const findAddress = await Address.findOne({ 
            "address._id": addressId 
        });

        console.log('Found Address Document:', findAddress);

        if (!findAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Update the address
        const updateResult = await Address.updateOne(
            { "address._id": addressId },
            {
                $set: {
                    "address.$": {
                        _id: addressId,
                        addressType: data.addressType,
                        name: data.name,
                        city: data.city,
                        landMark: data.landMark,
                        state: data.state,
                        pincode: data.pincode,
                        phone: data.phone,
                        altPhone: data.altPhone
                    }
                }
            }
        );

        console.log('Update Result:', updateResult);

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Address not found during update'
            });
        }

        if (updateResult.modifiedCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'No changes made to address'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Address updated successfully'
        });

    } catch (error) {
        console.error("Error in edit address:", error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};



//
const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        const userId = req.session.user;

        // Validate address
        const userAddress = await Address.findOne({ 
            userId: userId,
            "address._id": addressId 
        });

        if (!userAddress) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address selected'
            });
        }

        // Get cart items
        const cart = await Cart.findOne({ userId: userId })
            .populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const shipping = 100;
        const tax = 20;
        const finalAmount = subtotal + shipping + tax;

        // Create order
        const order = new Order({
            orderId: uuidv4(),
            orderedItems: cart.items.map(item => ({
                product: item.productId._id,
                quantity: item.quantity,
                price: item.totalPrice
            })),
            totalPrice: subtotal,
            discount: 0,
            finalAmount: finalAmount,
            address: addressId,
            status: 'Pending',
            paymentMethod: paymentMethod,
            createOn: new Date()
        });

        await order.save();

        // Clear cart
        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { items: [] } }
        );

        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderId
        });

    } catch (error) {
        console.error("Error in placeOrder:", error);
        return res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
};

module.exports = {
    getCheckout,
    checkoutAddAddress,
    checkOuteditAddress,
    placeOrder

}