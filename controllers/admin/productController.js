const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');




const getProducts = async (req,res)=>{
    try {
        if(req.session.admin){
            res.render('product')
        }
 
    } catch (error) {
        res.redirect('/pageerror')

    }
}

const getaddProduct = async (req,res)=>{
    try {
        if(req.session.admin){
            const category = await Category.find({isListed:true});
            res.render("addProducts",{cat:category})
        }
        
    
    } catch (error) {
        res.redirect('/pageerror')
    }
}


const addProducts = async (req, res) => {
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
                return res.status(400).json({ error: "Invalid Category name" });
            }

            // Create a new product
            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                createdOn: new Date(),
                quantity: products.quantity,
                size: products.size,
                color: products.color,
                productImage: images,
                status: 'Available',
            });

            await newProduct.save();

            // Redirect on success
            return res.redirect('/admin/products/addProducts');
        } else {
            return res.status(400).json({
                error: "Product already exists. Please try another name",
            });
        }
    } catch (error) {
        console.error("Error saving products", error);
        return res.redirect('/admin/pageerror');
    }
};





module.exports = {
    getProducts,
    getaddProduct,
    addProducts



}