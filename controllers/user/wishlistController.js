const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');





const getWishlist = async (req,res)=>{
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');
        
        if (!wishlist) {
            return res.render('wishlist', { user: null, wishlist: [] });
        }
        const products = wishlist.products.map((item) => item.productId);        res.render('wishlist',{
            user,
            wishlist:products
        })
    } catch (error) {
    console.error("error wishlist load",error);
    }
}
//
const addToWishlist = async (req,res)=>{
    try {
        const productId =req.body.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        if(user.wishlist.includes(productId)){
            return res.status(200).json({status:false,message: 'Product already in Wishlist'});
        }
        user.wishlist.push(productId);
        await user.save();
          // Add the product to the Wishlist collection
          let wishlist = await Wishlist.findOne({ userId });

          if (!wishlist) {
              // If no wishlist exists for the user, create a new one
              wishlist = new Wishlist({
                  userId,
                  products: [{ productId }]
              });
          } else {
              // If a wishlist exists, add the product to it
              wishlist.products.push({ productId });
          }
  
          await wishlist.save();
  

        return res.status(200).json({status:true,message:"Product added to Wishlist "})
    } catch (error) {
        console.error(error);
        return res.status(500).json({status:false,message:'Server error'});
    }
} 
const removeProduct = async (req, res) => {
    try {
      const productId = req.query.productId;
      const userId = req.session.user;
  
      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ status: false, message: 'User not found' });
      }
  
      // Check if the product exists in the wishlist
      const index = user.wishlist.indexOf(productId);
      if (index === -1) {
        return res.status(404).json({ status: false, message: 'Product not found in wishlist' });
      }
  
      // Remove the product from the wishlist
      user.wishlist.splice(index, 1);
      await user.save();
       // Remove the product from the Wishlist collection
       const wishlist = await Wishlist.findOne({ userId });
       if (wishlist) {
           wishlist.products = wishlist.products.filter(
               (product) => product.productId.toString() !== productId
           );
           await wishlist.save();
       }
  
      // Return success response
      return res.status(200).json({ status: true, message: 'Product removed from wishlist' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ status: false, message: 'Server error' });
    }
  };

module.exports={
    getWishlist,
    addToWishlist,
    removeProduct
}