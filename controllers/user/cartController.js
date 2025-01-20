const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');


const getAddToCart = async (req, res) => {
    try {
        // Find user's cart and populate full product details
        const userCart = await Cart.findOne({ userId: req.user._id })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice productImage'
            });

        if (!userCart) {
            return res.render('cart', {
                cart: [],
                total: 0,
                messages: {
                    success: req.flash('success'),
                    error: req.flash('error')
                }
            });
        }

        // Transform cart items to include all necessary data
        const cartItems = userCart.items.map(item => ({
            productId: item.productId._id,
            productName: item.productId.productName,
            productImage: item.productId.productImage, // Now properly populated
            quantity: item.quantity,
            size: item.size,
            price: item.price,
            salePrice: item.productId.salePrice, // Add salePrice here
            totalPrice: item.totalPrice,
            status: item.status
        }));

        const total = cartItems.reduce(
            (sum, item) => sum + (item.totalPrice || 0), 0
        );


        return res.render('cart', {
            cart: cartItems,
            total,
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
        const selectedSize = req.body.size || ''; // Provide default empty string
        const quantity = parseInt(req.body.quantity) || 1;

           // Log the values to debug
           console.log('Selected Size:', selectedSize);
           console.log('Product ID:', productId);
        
        // Validate size selection
        if (!selectedSize) {
            req.flash('error', 'Please select a size');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Validate product exists
        const product = await Product.findById(productId);
        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/pageNotFound');
        }



        // const sizeKey = `size${selectedSize}`;
        //   // Check if selected size has enough stock
        //   if (!product.size[sizeKey] || product.size[sizeKey] < quantity) {
        //     req.flash('error', 'Selected size is out of stock or insufficient quantity');
        //     return res.redirect(`/productDetails?id=${productId}`);
        // }

        // Find or create cart
        let userCart = await Cart.findOne({ userId: req.user._id });
        if (!userCart) {
            userCart = new Cart({
                userId: req.user._id,
                items: []
            });
        }

        // Check if product already in cart
        const existingItemIndex = userCart.items.findIndex(
            item => item.productId.toString() === productId.toString() &&
            item.size === selectedSize
        );


    if (existingItemIndex > -1) {
        // Update existing item
        userCart.items[existingItemIndex].quantity += quantity;
        userCart.items[existingItemIndex].totalPrice = 
            userCart.items[existingItemIndex].quantity * userCart.items[existingItemIndex].price;
    } else {
            // Add new item
            userCart.items.push({
                productId: product._id,
                size: selectedSize,
                quantity: 1,
                price: product.salePrice,
                totalPrice: product.salePrice,
                status: 'placed'
            });
        }

        await userCart.save();
        req.flash('success', 'Product added to cart successfully');
        return res.redirect('/cart');

    } catch (error) {
        console.error("Error in addToCartByGet:", error);
        req.flash('error', 'Failed to add product to cart');
        return res.redirect('/pageNotFound');
    }
};
const updateCartQuantity = async (req, res) => {
    try {
        const { productId, action ,size} = req.body;

        // Find cart and populate product details
        const userCart = await Cart.findOne({ userId: req.user._id })
            .populate({
                path: 'items.productId',
                select: 'productName salePrice'
            });

        if (!userCart) {
            req.flash('error', 'Cart not found');
            return res.redirect('/cart');
        }

        const itemIndex = userCart.items.findIndex(
            item => item.productId._id.toString() === productId && item.size ===size
        );

        if (itemIndex === -1) {
            req.flash('error', 'Item not found in cart');
            return res.redirect('/cart');
        }

        // Update quantity
        if (action === 'increase') {
            userCart.items[itemIndex].quantity += 1;
        } else if (action === 'decrease') {
            if (userCart.items[itemIndex].quantity > 1) {
                userCart.items[itemIndex].quantity -= 1;
            } 

        }

        // Update total price for the item if it still exists
        if (userCart.items[itemIndex]) {
            userCart.items[itemIndex].totalPrice = 
                userCart.items[itemIndex].quantity * 
                userCart.items[itemIndex].productId.salePrice;
        }

        await userCart.save();
        req.flash('success', 'Cart updated successfully');
        return res.redirect('/cart');

    } catch (error) {
        console.error('Error in updateCartQuantity:', error);
        req.flash('error', 'Error updating cart quantity');
        return res.redirect('/cart');
    }
};
const removeFromCart = async (req, res) => {
    try {
        const { productId, size } = req.body;
        
        // Use findOneAndUpdate with $pull to remove specific size variant
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
        );
        
        if (!updatedCart) {
            req.flash('error', 'Cart not found');
            return res.redirect('/cart');
        }
        
        req.flash('success', 'Item removed from cart successfully');
        return res.redirect('/cart');
        
    } catch (error) {
        console.error('Error in removeFromCart:', error);
        req.flash('error', 'Error removing item from cart');
        return res.redirect('/cart');
    }
};

module.exports = {
    getAddToCart,
    addToCartByGet,
    removeFromCart,
    updateCartQuantity
    
}