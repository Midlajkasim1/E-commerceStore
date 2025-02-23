const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const env = require('dotenv').config();





const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById(userId);
        const wishlist = await Wishlist.findOne({ userId }).populate('products.productId');


        if (!wishlist) {
            return res.render('wishlist', { user, wishlist: [] });
        }
        const products = wishlist.products.map((item) => item.productId);
        res.render('wishlist', {
            user,
            wishlist: products
        })
    } catch (error) {
        console.error("error wishlist load", error);
    }
}
//
const addToWishlist = async (req, res) => {
    try {
        const productId = req.body.productId;
        const userId = req.session.user;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(200).json({ status: false, message: 'Please login to add To wishlist' });

        }
        // if(user.wishlist.includes(productId)){
        //     return res.status(200).json({status:false,message: 'Product already in Wishlist'});
        // }
        // user.wishlist.push(productId);
        // await user.save();
        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId }]
            });
        } else {
            //   wishlist.products.push({ productId });
            const productExists = wishlist.products.some(item =>
                item.productId.toString() === productId.toString()
            );
            if (productExists) {
                return res.status(200).json({ status: false, message: 'Product already in Wishlist' });
            }
            wishlist.products.push({ productId });

        }

        await wishlist.save();


        return res.status(200).json({ status: true, message: "Product added to Wishlist " })
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
}
// const removeProduct = async (req, res) => {
//     try {
//       const productId = req.query.productId;
//       const userId = req.session.user;

//       const user = await User.findById(userId);
//       if (!user) {
//         return res.status(404).json({ status: false, message: 'User not found' });
//       }

//       const index = user.wishlist.indexOf(productId);
//       if (index === -1) {
//         return res.status(404).json({ status: false, message: 'Product not found in wishlist' });
//       }

//       user.wishlist.splice(index, 1);
//       await user.save();
//        const wishlist = await Wishlist.findOne({ userId });
//        if (wishlist) {
//            wishlist.products = wishlist.products.filter(
//                (product) => product.productId.toString() !== productId
//            );
//            await wishlist.save();
//        }

//       return res.status(200).json({ status: true, message: 'Product removed from wishlist' });
//     } catch (error) {
//       console.error(error);
//       return res.status(500).json({ status: false, message: 'Server error' });
//     }
//   };


const removeProduct = async (req, res) => {
    try {
        const productId = req.query.productId;
        const userId = req.session.user;

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(400).json({ status: false, message: 'Wishlist not found' })
        }
        const intialLength = wishlist.products.length;
        wishlist.products = wishlist.products.filter((product) => product.productId.toString() !== productId);
        if (intialLength === wishlist.products.length) {
            return res.status(404).json({ status: false, message: 'Product not found in wishlist' })
        }
        await wishlist.save();
        return res.status(200).json({ status: true, message: 'Product removed from wishlist' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
}
module.exports = {
    getWishlist,
    addToWishlist,
    removeProduct
}