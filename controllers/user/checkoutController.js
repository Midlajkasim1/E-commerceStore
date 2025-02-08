const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema');
const mongoose = require('mongoose');




const getCheckout = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);

        const userAddress = await Address.findOne({ userId: req.session.user });
        
        const userCart = await Cart.findOne({ userId: req.session.user })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice productImage'
            });

        if (!userCart) {
            return res.redirect('/cart');
        }
        let wallet = await Wallet.findOne({ userId: req.session.user });
        if (!wallet) {
            wallet = { balance: 0 }; 
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
        let discount =0   

        if (user && user.redeemedUser) {
            const coupon = await Coupon.findById(user.redeemedUser);
            if (coupon) discount = coupon.offerPrice;
        }
        
        const total = subtotal + shipping + tax - discount;

        res.render('checkout', {
            addresses: userAddress ? userAddress.address : [],
            cartItems,
            subtotal,
            shipping,
            tax,
            total,
            wallet: wallet.balance, 
            user: req.user || req.session.user ,
            message:req.flash()
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
        // console.log('Successfully saved address:', savedAddress);
           req.flash('err','Address added successfully')
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
        const addressId = req.body.addressId; 
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
const applyCoupon = async (req, res) => {
    try {
        const { couponcode, totalAmount } = req.body;
        const userId = req.session.user;

        if (!couponcode || !totalAmount) {
            return res.status(400).json({
                status: false,
                message: 'Coupon code and total amount are required'
            });
        }

        const parsedAmount = parseFloat(totalAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                status: false,
                message: 'Invalid total amount'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).json({
                status: false,
                message: 'User not found'
            });
        }

        const coupon = await Coupon.findOne({
            name: couponcode.toUpperCase(),
            isList: true
        });

        if (!coupon) {
            return res.status(400).json({
                status: false,
                message: 'Invalid coupon code'
            });
        }

        // Check coupon validity
        if (coupon.expireOn < new Date()) {
            return res.status(400).json({
                status: false,
                message: 'Coupon has expired'
            });
        }

        // **ENSURE THAT THE MINIMUM PURCHASE AMOUNT IS CHECKED**
        if (parsedAmount < coupon.minimumPrice) {
            return res.status(400).json({
                status: false,
                message: `Minimum purchase of ₹${coupon.minimumPrice} required`
            });
        }

        // Ensure usedUsers is initialized
        if (!coupon.usedUsers) {
            coupon.usedUsers = [];
        }

        // Check if the user has already used the coupon
        if (coupon.usedUsers.includes(userId)) {
            return res.status(400).json({
                status: false,
                message: 'Coupon already used'
            });
        }

        // Apply the coupon discount
        let discount = coupon.offerPrice;
         req.session.discount = discount
        // Prevent discount from exceeding total amount
        let finalAmount = Math.max(parsedAmount - discount, 0);

        // Mark coupon as used for the user
        coupon.usedUsers.push(userId);
        await coupon.save();

        user.redeemedUser = coupon._id;
        await user.save();

        return res.status(200).json({
            status: true,
            message: 'Coupon applied successfully',
            finalAmount: finalAmount
        });

    } catch (error) {
        console.error('Error in applyCoupon:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to apply coupon'
        });
    }
};



const removeCoupon = async (req, res) => {
    try {
        const code=req.query.couponCode
        const userId = req.session.user;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(400).json({
                status: false,
                message: 'User not found'
            });
        }

        // Recalculate total without coupon
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(400).json({
                status: false,
                message: 'Cart not found'
            });
        }

        await Coupon.updateOne(
            {
                name:code
            },
            {
                $pull:{
                    usedUsers:userId
                }
            }
        )

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const shipping = 100;
        const tax = 20;
        const total = subtotal + shipping + tax;

        user.redeemedUser = null;
        await user.save();

        res.status(200).json({
            status: true,
            message: 'Coupon removed successfully',
            finalAmount: total
        });

    } catch (error) {
        console.error('Error in removeCoupon:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to remove coupon'
        });
    }
};
module.exports = {
    getCheckout,
    checkoutAddAddress,
    checkOuteditAddress,
    // placeOrder,
    applyCoupon,
    removeCoupon

}