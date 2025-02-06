const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const mongoose = require('mongoose');




const getProducts = async (req, res) => {
    try {
        if (req.session.admin) {
            const search = req.query.search || "";
            const page = parseInt(req.query.page) || 1;
            const limit = 4;
            const skip = (page - 1) * limit;

            const productData = await Product.find({
                productName: { $regex: new RegExp(".*" + search + ".*", "i") }
            })
                .skip(skip)
                .limit(limit)
                .populate('category')
                .exec();

            const count = await Product.countDocuments({
                productName: { $regex: new RegExp(".*" + search + ".*", "i") }
            });

            const category = await Category.find({ isListed: true });

            if (category) {
                const totalPages = Math.ceil(count / limit);
                
                res.render('product', {
                    search: search,
                    data: productData,
                    currentPage: page,
                    totalPages: totalPages,
                    cat: category,
                    message:req.flash('success')
                });
            } else {
                res.render('page-404');
            }
        }
    } catch (error) {
        console.error('Pagination Error:', error);
        res.redirect('/pageerror');
    }
}

const getaddProduct = async (req,res)=>{
    try {
        if(req.session.admin){
            const message =req.session.error
            const category = await Category.find({isListed:true});
            res.render("addProducts",{cat:category,message:req.flash('added')})
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

        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if (!productExists) {
            const images = [];

            const uploadDir = path.join('public', 'uploads', 'product-images');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join(uploadDir, req.files[i].filename);

                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push(req.files[i].filename);
                }
            }

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
            req.flash('added','Product added successfully')

            return res.redirect('/admin/products/addProducts');
        } else {
            req.session.error = 'Product already exists. Please try another name'
            return res.redirect('/admin/products/addProducts');

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
        if(findCategory.categoryOffer > percentage) {
            return res.json({status: false, message: "This products category already has a category offer"});
        }
        // findProduct.originalSalePrice = findProduct.salePrice;
         findProduct.salePrice = findProduct.salePrice-Math.floor(findProduct.regularPrice*(percentage/100))
         findProduct.productOffer =  parseInt(percentage);
          await findProduct.save();
          findCategory.categoryOffer=0;
          await findCategory.save();
          res.json({status:true});
    } catch (error) {
         res.redirect("/pageerror");
    }
 }


//
const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;
        console.log('Received productId:', productId);

        const findProduct = await Product.findOne({ _id: productId });
        if (!findProduct) {
            return res.status(404).json({ status: false, message: "Product not found" });
        }

        const percentage = findProduct.productOffer;
        // const newPrice = product.originalSalePrice; 
        
        findProduct.salePrice = findProduct.salePrice + Math.floor(findProduct.regularPrice * (percentage/100));
        findProduct.productOffer = 0;
        
        await findProduct.save();
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
const unblockProduct = async (req,res)=>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{isBlocked:false});
        res.redirect('/admin/products')
    } catch (error) {
        res.redirect('/pageerror')
    }
}

//edit product
const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({ _id: id }).populate('category');
        const category = await Category.find({});
        res.render('editProduct', {
            product: product,
            cat: category,
        });
    } catch (error) {
        res.redirect('/pagerror');
    }
};
const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        console.log('Product ID to update:', id);
        console.log('Received data:', req.body);
        console.log('Received files:', req.files);

        // Validate if ID exists
        if (!id) {
            req.flash('error', 'Product ID is required');
            return res.redirect('/admin/products');
        }

        // First check if product exists
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            req.flash('error', 'Product not found');
            return res.redirect('/admin/products');
        }

        const data = req.body;

        // Validate category
        const categoryId = await Category.findById(data.category);
        if (!categoryId) {
            req.flash('error', 'Invalid category');
            return res.redirect('/admin/products');
        }

        // Check for duplicate product name
        const duplicateProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });

        if (duplicateProduct) {
            req.flash('error', 'Product name already exists');
            return res.redirect(`/admin/products/editProduct/${id}`);
        }

        // Process images
        const images = req.files?.map(file => file.filename) || [];

        // Process size data
        const sizeData = {
            sizeS: parseInt(data.sizeS) || 0,
            sizeM: parseInt(data.sizeM) || 0,
            sizeL: parseInt(data.sizeL) || 0,
            sizeXL: parseInt(data.sizeXL) || 0,
            sizeXXL: parseInt(data.sizeXXL) || 0
        };

        // Calculate total quantity from all sizes
        const totalQuantity = Object.values(sizeData).reduce((sum, stock) => sum + stock, 0);

        // Prepare update data
        const updateFields = {
            productName: data.productName,
            description: data.description,
            category: categoryId._id,
            regularPrice: parseFloat(data.regularPrice),
            salePrice: parseFloat(data.salePrice),
            quantity: totalQuantity,
            color: data.color,
            size: sizeData
        };

        if (images.length > 0) {
            updateFields.productImage = images;
        }

        // Update product status based on total quantity
        updateFields.status = totalQuantity > 0 ? "Available" : "out of stock";

        // Perform update
        await Product.findByIdAndUpdate(
            id,
            updateFields,
            { new: true, runValidators: true }
        );

        // Add flash message for successful update
        req.flash('success', 'Product updated successfully');

        // Redirect to products listing page
        return res.redirect('/admin/products');

    } catch (error) {
        console.error('Error in editProduct:', error);
        req.flash('error', 'Error updating product');
        return res.redirect('/admin/products');
    }
};
//
const deleteSingle = async (req, res) => {
    try {
        const { imageNameToServer } = req.body;
        const productIdToServer = req.params.id; 

        if (!mongoose.Types.ObjectId.isValid(productIdToServer)) {
            return res.status(400).json({ status: false, message: 'Invalid Product ID' });
        }

        const product = await Product.findByIdAndUpdate(productIdToServer, {
            $pull: { productImage: imageNameToServer }
        });

        if (!product) {
            return res.status(404).json({ status: false, message: 'Product not found' });
        }

        const imagePath = path.join('public', 'uploads', 're-image', imageNameToServer);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
            return res.send({ status: true });
        } else {
            console.log(`Image ${imageNameToServer} not found`);
            return res.send({ status: false, message: 'Image not found' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send({ status: false, message: 'Error occurred while deleting the image.' });
    }
};

  

module.exports = {
    getProducts,
    getaddProduct,
    addProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingle

}