const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');





const productDetails = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const productId = req.query.id;
        const product = await Product.findById(productId).populate('category');
        const findcategory = product.category;
        const categoryOffer = findcategory ?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = categoryOffer + productOffer;

        const allProducts=await Product.find({category: findcategory})

        const randomNum=new Set()

        while(randomNum.size<3){
            const num=Math.floor(Math.random()*10)
            if(num<=allProducts.length){
                randomNum.add(num)
            }
        }

        const ranNum=Array.from(randomNum)                
         
        res.render("productDetails",{
            user:userData,
            product:product,
            quantity:product.quantity,
            totalOffer:totalOffer,
            category:findcategory,
            ranNum:ranNum,
            allProducts: allProducts
        });

    } catch (error) {
        console.log("error for product details",error);
        res.redirect('/pageNotFound')
        
    }
}

module.exports  ={
    productDetails
}