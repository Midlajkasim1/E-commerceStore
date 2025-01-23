const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Review = require('../../models/reviewSchema');



const productDetails = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findcategory = product.category;
        const categoryOffer = findcategory?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        // Fetch reviews for this product
        const reviews = await Review.find({ productId })
            .populate('userId', 'name')
            .sort({ createdAt: -1 });

        // Calculate average rating
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : 0;
        const totalReviews = reviews.length;

        // Modified: Get all sizes with their stock status
        const availableSizes = ['sizeS', 'sizeM', 'sizeL', 'sizeXL', 'sizeXXL'].map(sizeKey => ({
            label: sizeKey.replace('size', ''), // Convert sizeS to S
            stock: product.size[sizeKey] || 0,  // If size doesn't exist, stock is 0
        }));

        const allProducts = await Product.find({category: findcategory});

        const randomNum = new Set();
        
        while(randomNum.size < 3){
            const num = Math.floor(Math.random() * 10);
            if(num <= allProducts.length){
                randomNum.add(num);
            }
        }

        const ranNum = Array.from(randomNum);                
         
        res.render("productDetails", {
            user: userData,
            product: product,
            quantity: product.quantity,
            totalOffer: totalOffer,
            category: findcategory,
            ranNum: ranNum,
            allProducts: allProducts,
            availableSizes: availableSizes,
            reviews: reviews,
            averageRating: averageRating,
            totalReviews: totalReviews,
            messages: req.flash() // Added flash messages handling
        });

    } catch (error) {
        console.log("error for product details", error);
        res.redirect('/pageNotFound');
    }
}


const submitReview = async (req, res) => {
    try {
        const { productId, rating, review } = req.body;
        // Use req.session.user instead of req.session.userId to match your session structure
        const userId = req.session.user;

        if (!userId) {
            req.flash('error', 'Please login to submit a review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Check if user has already reviewed this product
        const existingReview = await Review.findOne({ userId, productId });
        if (existingReview) {
            req.flash('error', "You've already reviewed this product");
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Create new review
        const newReview = new Review({
            userId,
            productId,
            rating: parseInt(rating),
            review
        });
        await newReview.save();

        // Update product's average rating and total reviews
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
        
        // Check if user is logged in
        if (!req.session.user) {
            req.flash('error', 'Please login to delete review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Find the review
        const review = await Review.findById(reviewId);
        
        if (!review) {
            req.flash('error', 'Review not found');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Check if the logged-in user is the review author
        if (review.userId.toString() !== req.session.user.toString()) {
            req.flash('error', 'You are not authorized to delete this review');
            return res.redirect(`/productDetails?id=${productId}`);
        }

        // Delete the review
        await Review.findByIdAndDelete(reviewId);

        // Update product's average rating and total reviews
        const remainingReviews = await Review.find({ productId });
        
        let newAverageRating = 0;
        if (remainingReviews.length > 0) {
            const totalRating = remainingReviews.reduce((sum, rev) => sum + rev.rating, 0);
            newAverageRating = totalRating / remainingReviews.length;
        }

        // Update the product with new rating and review count
        await Product.findByIdAndUpdate(productId, {
            averageRating: newAverageRating.toFixed(1),
            totalReviews: remainingReviews.length
        });

        req.flash('success', 'Review deleted successfully');
        return res.redirect(`/productDetails?id=${productId}`);

    } catch (error) {
        console.error('Error deleting review:', error);
        req.flash('error', 'Error deleting review');
        return res.redirect(`/productDetails?id=${productId}`);
    }
};
module.exports  ={
    productDetails,
    submitReview,
    getProductReviews,
    deleteReview
}