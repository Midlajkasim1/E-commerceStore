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
        const taxRate = 0.02; // 2% tax
        const tax = subtotal * taxRate;
        let shipping = subtotal >= 2000 ? 0 : 100; // Free shipping for orders ≥ 2000
        let discount = 0;
        let couponCode = null;
        let appliedCoupon = null;


        if (user && user.redeemedUser) {
            appliedCoupon = await Coupon.findById(user.redeemedUser);
            if (appliedCoupon) {
                discount = appliedCoupon.offerPrice;
                couponCode = appliedCoupon.name; // Changed from coupon.code to coupon.name
            }
        }

        const total = subtotal + shipping + tax - discount;

        res.render('checkout', {
            addresses: userAddress ? userAddress.address : [],
            cartItems,
            subtotal,
            shipping,
            tax,
            discount,
            couponCode,
            total,
            wallet: wallet.balance,
            user: req.user || req.session.user,
            message: req.flash(),
            appliedCoupon: appliedCoupon ? {
                name: appliedCoupon.name,
                offerPrice: appliedCoupon.offerPrice
            } : null
        });


    } catch (error) {
        console.error("Error in getCheckout:", error);
        res.redirect('/cart');
    }
};

const checkoutAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('Adding address for user ID:', userId);

        const { addressType, name, phone, altPhone, landMark, city, state, pincode } = req.body;
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
                userId: userId,
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
        req.flash('err', 'Address added successfully')
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

const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user;
        const currentDate = new Date();

        const coupons = await Coupon.find({
            isList: true,
            expireOn: { $gte: currentDate },
            usedUsers: { $nin: [userId] }
        });

        res.status(200).json({
            status: true,
            coupons
        });
    } catch (error) {
        console.error('Error in getAvailableCoupons:', error);
        res.status(500).json({
            status: false,
            message: 'Failed to fetch available coupons'
        });
    }
};
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

        // Check if the user already has a coupon applied
        if (user.redeemedUser) {
            // Remove the existing coupon
            const existingCoupon = await Coupon.findById(user.redeemedUser);
            if (existingCoupon) {
                await Coupon.updateOne(
                    { _id: existingCoupon._id },
                    { $pull: { usedUsers: userId } }
                );
            }
            user.redeemedUser = null;
            await user.save();
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

        if (coupon.expireOn < new Date()) {
            return res.status(400).json({
                status: false,
                message: 'Coupon has expired'
            });
        }

        if (parsedAmount < coupon.minimumPrice) {
            return res.status(400).json({
                status: false,
                message: `Minimum purchase of ₹${coupon.minimumPrice} required`
            });
        }

        if (coupon.usedUsers.includes(userId)) {
            return res.status(400).json({
                status: false,
                message: 'Coupon already used'
            });
        }

        let discount = coupon.offerPrice;
        req.session.discount = discount;
        let finalAmount = Math.max(parsedAmount - discount, 0);

        coupon.usedUsers.push(userId);
        await coupon.save();

        user.redeemedUser = coupon._id;
        await user.save();

        return res.status(200).json({
            status: true,
            message: 'Coupon applied successfully',
            finalAmount: finalAmount,
            discount: discount
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
        const code = req.query.couponCode;
        const userId = req.session.user;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(400).json({
                status: false,
                message: 'User not found'
            });
        }

        // Find the coupon
        const coupon = await Coupon.findOne({ name: code });
        if (!coupon) {
            return res.status(400).json({
                status: false,
                message: 'Coupon not found'
            });
        }

        // Remove the user from the coupon's usedUsers array
        await Coupon.updateOne(
            { name: code },
            { $pull: { usedUsers: userId } }
        );

        // Reset the redeemedUser field in the User model
        user.redeemedUser = null;
        await user.save();

        // Recalculate the total amount
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart) {
            return res.status(400).json({
                status: false,
                message: 'Cart not found'
            });
        }

        const subtotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        const shipping = subtotal >= 2000 ? 0 : 100; // Free shipping for orders ≥ 2000
        const tax = subtotal * 0.02; // 2% tax
        const total = subtotal + shipping + tax;

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
    getAvailableCoupons,
    applyCoupon,
    removeCoupon

}