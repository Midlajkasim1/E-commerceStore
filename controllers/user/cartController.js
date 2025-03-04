const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const ProductVariant = require('../../models/productVariantSchema')
const Cart = require('../../models/cartSchema');


const getAddToCart = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const itemsPerPage = 5;

        const userCart = await Cart.findOne({ userId: req.user._id })
        .populate({
            path: 'items.productId',
            select: 'productName salePrice productImage'
        })
        .populate({
            path: 'items.variantId',
            select: 'size quantity'
        });

        if (!userCart || userCart.items.length === 0) {
            return res.render('cart', {
                cart: [],
                user: req.user,
                total: 0,
                currentPage: 1,
                totalPages: 1,
                messages: {
                    success: req.flash('success'),
                    error: req.flash('error')
                }
            });
        }

        const cartItems = userCart.items.map(item => {
            return {
                productId: item.productId._id,
                productName: item.productId.productName,
                productImage: item.productId.productImage,
                quantity: item.quantity,
                size: item.size,
                price: item.price,
                salePrice: item.price,
                totalPrice: item.totalPrice, 
                status: item.status
            };
        });

        const total = cartItems.reduce(
            (sum, item) => sum + (item.totalPrice || 0), 0
        );

        const totalItems = cartItems.length;
        const totalPages = Math.ceil(totalItems/itemsPerPage);
        const skip = (page - 1) * itemsPerPage;
        const paginationItems = cartItems.slice(skip, skip + itemsPerPage);

        return res.render('cart', {
            cart: paginationItems,
            total,
            user: req.user,
            currentPage: page,
            totalPages: totalPages,
            itemsPerPage: itemsPerPage, 

            totalItems: totalItems,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error("Error in getAddToCart:", error);
        req.flash('error', 'Unable to load cart. Please try again.');
        return res.redirect('back');
    }
};
const addToCartByGet = async (req, res) => {
    try {
        const productId = req.params.id;
        const selectedSize = req.body.size || '';
        const quantity = parseInt(req.body.quantity) || 1;

        if (!selectedSize) {
            return res.json({
                success: false,
                message: 'Please select a size'
            });
        }

        const product = await Product.findById(productId);

        if (!product) {
            console.error('Product not found for product ID:', productId);
            return res.json({
                success: false,
                message: 'Product not found',
                notFound: true
            });
        }

        const variant = await ProductVariant.findOne({
            productId: productId,
            size: selectedSize,
            isActive: true
        });

        if (!variant) {
            console.error('Product variant not found for product ID:', productId, 'and size:', selectedSize);
            return res.json({
                success: false,
                message: 'Product variant not found',
                notFound: true
            });
        }

        if (variant.quantity < quantity) {
            return res.json({
                success: false,
                message: 'Selected size is out of stock',
                outOfStock: true
            });
        }

        let userCart = await Cart.findOne({ userId: req.user._id });
        if (!userCart) {
            userCart = new Cart({
                userId: req.user._id,
                items: []
            });
        }

        const existingItemIndex = userCart.items.findIndex(
            item => item.productId.toString() === productId.toString() &&
                item.size === selectedSize
        );

        const MAX_PURCHASE_LIMIT = 3;

        if (existingItemIndex > -1) {
            return res.json({
                success: false,
                message: 'This product with selected size is already in your cart',
                alreadyInCart: true
            });
        } else {
            if (quantity > MAX_PURCHASE_LIMIT) {
                return res.json({
                    success: false,
                    message: `Maximum ${MAX_PURCHASE_LIMIT} items allowed per product`,
                    purchaseLimit: true,
                    maxLimit: MAX_PURCHASE_LIMIT
                });
            }

            const price = product.salePrice || 0;
            const totalPrice = price * quantity;
         
            userCart.items.push({
                productId: productId,
                variantId: variant._id,
                size: selectedSize,
                quantity: quantity,
                price: price,
                totalPrice: totalPrice,
                status: 'placed'
            });
        }

        await userCart.save();
        return res.json({
            success: true,
            message: 'Product added to cart successfully'
        });

    } catch (error) {
        console.error("Error in addToCartByGet:", error);
        req.flash('error', 'Failed to add product to cart');
        return res.redirect('/pageNotFound');
    }
};



const updateCartQuantity = async (req, res) => {
    try {
        const { productId, action, size } = req.body;
        const MAX_PURCHASE_LIMIT = 3;


        const userCart = await Cart.findOne({ userId: req.user._id })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice size',
            });

        if (!userCart) {
            return res.json({
                success: false,
                message: 'Cart not found'
            });
        }

        const itemIndex = userCart.items.findIndex(
            (item) => item.productId._id.toString() === productId && item.size === size
        );

        if (itemIndex === -1) {
            return res.json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.json({
                success: false,
                message: 'Product not found'
            });
        }  if (product.hasVariants) {
            const variant = await ProductVariant.findOne({
                productId: productId,
                size: size,
                isActive: true
            });
            if (variant) {
                currentStock = variant.quantity;
            }
        } else {
            currentStock = 0; 
        }

        const currentQuantity = userCart.items[itemIndex].quantity;

        if (action === 'increase') {
            if (currentQuantity + 1 > currentStock) {
                return res.json({
                    success: false,
                    message: `Only ${currentStock} items available in stock for size ${size}`,
                    stockLimit: true,
                    currentStock
                });
            }
            if (currentQuantity + 1 > MAX_PURCHASE_LIMIT) {
                return res.json({
                    success: false,
                    message: `Maximum ${MAX_PURCHASE_LIMIT} items allowed per product`,
                    purchaseLimit: true,
                    maxLimit: MAX_PURCHASE_LIMIT
                });
            }
            userCart.items[itemIndex].quantity += 1;
        } else if (action === 'decrease') {
            if (currentQuantity > 1) {
                userCart.items[itemIndex].quantity -= 1;
            }
        }

        userCart.items[itemIndex].totalPrice =
        userCart.items[itemIndex].quantity * userCart.items[itemIndex].price;

        await userCart.save();

        const subtotal = userCart.items.reduce((total, item) =>
            total + (item.quantity * item.productId.salePrice), 0);
        const shipping = subtotal >= 2000 ? 0 : 100;
        const total = subtotal + shipping;

        return res.json({
            success: true,
            message: 'Cart updated successfully',
            newQuantity: userCart.items[itemIndex].quantity,
            newItemTotal: userCart.items[itemIndex].totalPrice,
            cartTotals: {
                subtotal,
                shipping,
                total,
                freeDeliveryEligible: subtotal >= 2000
            }
        });

    } catch (error) {
        console.error('Error updating cart quantity:', error);
        return res.json({
            success: false,
            message: 'Error updating cart quantity'
        });
    }
};


const removeFromCart = async (req, res) => {
    try {
        const { productId, size } = req.body;

        const updatedCart = await Cart.findOneAndUpdate(
            { userId: req.user._id },
            {
                $pull: {
                    items: {
                        productId: productId,
                        size: size
                    }
                }
            },
            { new: true }
        ).populate('items.productId', 'salePrice');

        if (!updatedCart) {
            return res.json({
                success: false,
                message: 'Cart not found'
            });
        }

        const subtotal = updatedCart.items.reduce((total, item) =>
            total + (item.quantity * item.productId.salePrice), 0);

        const shipping = updatedCart.items.length === 0 ? 0 : (subtotal >= 2000 ? 0 : 100);
        const total = subtotal + shipping;

        return res.json({
            success: true,
            message: 'Item removed from cart successfully',
            cartTotals: {
                subtotal,
                shipping,
                total,
                freeDeliveryEligible: subtotal >= 2000
            }
        });

    } catch (error) {
        console.error('Error in removeFromCart:', error);
        return res.json({
            success: false,
            message: 'Error removing item from cart'
        });
    }
};
module.exports = {
    getAddToCart,
    addToCartByGet,
    removeFromCart,
    updateCartQuantity

}