const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { categoryInfo } = require('./categoryController');




const getProducts = async (req,res)=>{
    try {
        if(req.session.admin){
            const search = req.query.search || "";
            const page = req.query.page || 1;
            const limit = 4;
            const productData = await Product.find({
              
            productName:{$regex:new RegExp(".*"+search+".*","i")}
                
            })
            .limit(limit *1)
            .skip((page - 1) * limit)
            .populate('category')
            .exec();
            const count = await Product.find({
                productName:{$regex:new RegExp(".*"+search+".*","")}
            }).countDocuments();

            const category = await Category.find({isListed:true});
            if(category){
                res.render('product',{
                    search:search,
                    data:productData,
                    currentPage:page,
                    totalPages:Math.ceil(count/limit),
                    cat:category
                })

            }else{
                res.render('page-404')
            }

        }
 
    } catch (error) {
        res.redirect('/pageerror')

    }
}

const getaddProduct = async (req,res)=>{
    try {
        if(req.session.admin){
            const message =req.session.error
            const category = await Category.find({isListed:true});
            res.render("addProducts",{cat:category,message})
        }else{
            res.redirect('/admin/login')
        }
        
    
    } catch (error) {
        res.redirect('/pageerror')
    }
}


const addProducts = async (req, res) => {
    console.log("checkind product");
    
    try {
        const products = req.body;

        // Check if product already exists
        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if (!productExists) {
            const images = [];

            // Ensure the target directory exists
            const uploadDir = path.join('public', 'uploads', 'product-images');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Process uploaded files
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join(uploadDir, req.files[i].filename);

                    // Resize image using Sharp
                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push(req.files[i].filename);
                }
            }

            // Find category ID from name
            const categoryId = await Category.findOne({ name: products.category });
            if (!categoryId) {
                req.session.error = 'Invalid Category name'
                return res.redirect('/admin/products/addProducts');
           
            }
     console.log(products);
     const sizes = {
        sizeS: Number(products.sizeS) || 0,
        sizeM: Number(products.sizeM) || 0,
        sizeL: Number(products.sizeL) || 0,
        sizeXL: Number(products.sizeXL) || 0,
        sizeXXL: Number(products.sizeXXL) || 0,
    };
    
            // Create a new product
            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                createdOn: new Date(),
                quantity: products.quantity,
                size: {...sizes},
                color: products.color,
                productImage: images,
                status: 'Available',
            });
console.log(newProduct)
            await newProduct.save();

            // Redirect on success
            return res.redirect('/admin/products/addProducts');
        } else {
            req.session.error = 'Product already exists. Please try another name'
            return res.redirect('/admin/products/addProducts');

            // return res.status(400).json({
            //     error: "Product already exists. Please try another name",
            // });
        }
    } catch (error) {
        console.error("Error saving products", error);
        return res.redirect('/admin/pageerror');
    }
};

const addProductOffer = async (req,res)=>{
    try {
        const {productId,percentage} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const findCategory = await Category.findOne({_id:findProduct.category})
         if(findCategory.categoryOffer>percentage){
          return res.json({status:false,message:"This products category already has a category offer"});
         }
         findProduct.salePrice = findProduct.salePrice-Math.floor(findProduct.regularPrice*(percentage/100))
         findProduct.productOffer =  parseInt(percentage);
          await findProduct.save();
          findCategory.categoryOffer=0;
          await findCategory.save();
          res.json({status:true});
    } catch (error) {
         res.redirect("/pageerror");
         res.status(500).json({status:false, message: "Internal server error"})
    }
 }


//
const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;
        console.log('Received productId:', productId);

        // Find product - use findOne instead of find
        const product = await Product.findOne({ _id: productId });
        if (!product) {
            return res.status(404).json({ status: false, message: "Product not found" });
        }

        // Calculate new price
        const percentage = product.productOffer;
        const newPrice = product.regularPrice; // Reset to regular price
        
        // Update product
        product.salePrice = newPrice;
        product.productOffer = 0;
        
        await product.save();
        console.log('Product updated successfully');
        
        // Send only ONE response
        return res.status(200).json({ status: true, message: "Offer removed successfully" });

    } catch (error) {
        console.error('Error in removeProductOffer:', error);
        // Send only ONE error response
        return res.status(500).json({ status: false, message: "Internal server error" });
    }
};


//
const blockProduct = async (req,res)=>{
    try {
      let id = req.query.id;
      await Product.updateOne({_id:id},{$set:{isBlocked:true}});
      res.redirect('/admin/products')
    } catch (error) {
       res.redirect('/pageerror') 
    }
}
//
const UnblockProduct = async (req,res)=>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{isBlocked:false});
        res.redirect('/admin/products')
    } catch (error) {
        res.redirect('/pageerror')
    }
}



    

module.exports = {
    getProducts,
    getaddProduct,
    addProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    UnblockProduct

}