const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const ProductVariant = require('../../models/productVariantSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Review = require('../../models/reviewSchema');

const productDetails = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.redirect('/pageNotFound');
        }
        
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.redirect('/pageNotFound');
        }
        
        const findcategory = product.category;
        const categoryOffer = findcategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;
        
        const variants = await ProductVariant.find({
            productId: productId,
            isActive: true
        });
        
        
        const allPossibleSizes = ["S", "M", "L", "XL", "XXL"];
        
        const sizeStockMap = {};
        
        allPossibleSizes.forEach(size => {
            sizeStockMap[size] = 0;
        });
        
        variants.forEach(variant => {
            if (sizeStockMap.hasOwnProperty(variant.size)) {
                sizeStockMap[variant.size] += variant.quantity;
            }
        });
        
        const availableSizes = Object.keys(sizeStockMap).map(size => ({
            label: size,
            stock: sizeStockMap[size],
            isLowStock: sizeStockMap[size] <= 2 && sizeStockMap[size] > 0
        }));
        
        
        const totalProductQuantity = variants.reduce((sum, variant) => sum + variant.quantity, 0);
        
        const reviews = await Review.find({ productId })
            .populate('userId', 'name')
            .sort({ createdAt: -1 });
        
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;
        const totalReviews = reviews.length;
        
        const allProducts = await Product.find({
            category: findcategory,
            _id: { $ne: productId },
            isBlocked: false,
            status: "Available"
        });
        
        const similarProducts = [];
        const availableProducts = [...allProducts];
        while (similarProducts.length < 3 && availableProducts.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableProducts.length);
            const selectedProduct = availableProducts.splice(randomIndex, 1)[0];
            
            const productVariants = await ProductVariant.find({
                productId: selectedProduct._id,
                isActive: true
            });
            
            const hasStock = productVariants.some(v => v.quantity > 0);
            if (hasStock) {
                selectedProduct._totalQuantity = productVariants.reduce((sum, v) => sum + v.quantity, 0);
                similarProducts.push(selectedProduct);
            }
        }
        
        res.render("productDetails", {
            user: userData,
            product: product,
            quantity: totalProductQuantity,
            totalOffer: totalOffer,
            category: findcategory,
            similarProducts: similarProducts,
            availableSizes: availableSizes,
            reviews: reviews,
            averageRating: averageRating,
            totalReviews: totalReviews,
            messages: req.flash()
        });
    } catch (error) {
        console.log("error for product details", error);
        res.redirect('/pageNotFound');
    }
}
const submitReview = async (req, res) => {
    try {
        const { productId, rating, review } = req.body;
        const userId = req.session.user;

        if (!userId) {
            req.flash('error', 'Please login to submit a review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        const existingReview = await Review.findOne({ userId, productId });
        if (existingReview) {
            req.flash('error', "You've already reviewed this product");
            return res.redirect(`/productDetails?id=${productId}`);
        }

        const newReview = new Review({
            userId,
            productId,
            rating: parseInt(rating),
            review
        });
        await newReview.save();

        const allReviews = await Review.find({ productId });
        const totalRating = allReviews.reduce((sum, rev) => sum + rev.rating, 0);
        const averageRating = totalRating / allReviews.length;

        await Product.findByIdAndUpdate(productId, {
            averageRating: averageRating.toFixed(1),
            totalReviews: allReviews.length
        });

        req.flash('success', 'Review submitted successfully');
        return res.redirect(`/productDetails?id=${productId}`);
    } catch (error) {
        console.error('Error submitting review:', error);
        req.flash('error', 'Error submitting review');
        return res.redirect(`/productDetails?id=${req.body.productId}`);
    }
};

const getProductReviews = async (req, res) => {
    try {
        const productId = req.params.productId;
        const reviews = await Review.find({ productId })
            .populate('userId', 'name')
            .sort({ createdAt: -1 });

        return reviews;
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return [];
    }
}

const deleteReview = async (req, res) => {
    try {
        const reviewId = req.params.reviewId;
        const productId = req.params.productId;

        if (!req.session.user) {
            req.flash('error', 'Please login to delete review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        const review = await Review.findById(reviewId);

        if (!review) {
            req.flash('error', 'Review not found');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        if (review.userId.toString() !== req.session.user.toString()) {
            req.flash('error', 'You are not authorized to delete this review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        await Review.findByIdAndDelete(reviewId);

        const remainingReviews = await Review.find({ productId });

        let newAverageRating = 0;
        if (remainingReviews.length > 0) {
            const totalRating = remainingReviews.reduce((sum, rev) => sum + rev.rating, 0);
            newAverageRating = totalRating / remainingReviews.length;
        }

        await Product.findByIdAndUpdate(productId, {
            averageRating: newAverageRating.toFixed(1),
            totalReviews: remainingReviews.length
        });

        req.flash('success', 'Review deleted successfully');
        return res.redirect(`/productDetails?id=${productId}`);

    } catch (error) {
        console.error('Error deleting review:', error);
        req.flash('error', 'Error deleting review');
        return res.redirect(`/productDetails?id=${req.params.productId}`);
    }
};

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Login required' });
        }
        
        const productId = req.params.id;
        const { size, quantity } = req.body;
        
        const variant = await ProductVariant.findOne({
            productId: productId,
            size: size,
            isActive: true
        });
        
        if (!variant || variant.quantity < 1) {
            return res.status(400).json({ 
                success: false, 
                outOfStock: true,
                message: 'Product is out of stock in the selected size' 
            });
        }
        
        const existingCartItem = await Cart.findOne({
            userId: userId,
            'items.productId': productId,
            'items.size': size
        });
        
        if (existingCartItem) {
            return res.status(200).json({
                success: false,
                alreadyInCart: true,
                message: 'Product already in cart'
            });
        }
        
        const result = await Cart.findOneAndUpdate(
            { userId: userId },
            { 
                $push: { 
                    items: {
                        productId: productId,
                        variantId: variant._id,
                        size: size,
                        quantity: quantity || 1
                    }
                }
            },
            { upsert: true, new: true }
        );
        
        return res.status(200).json({
            success: true,
            message: 'Product added to cart successfully'
        });
        
    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    productDetails,
    submitReview,
    getProductReviews,
    deleteReview,
    addToCart
};