const Product = require('../../models/productSchema');
const ProductVariant = require('../../models/productVariantSchema');
const Category = require('../../models/categorySchema');
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
                .lean();

            for (let product of productData) {
                const variantCount = await ProductVariant.aggregate([
                    { $match: { 
                        productId: new mongoose.Types.ObjectId(product._id),
                        isActive: true 
                    } },
                    { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } }
                ]);

                product.totalQuantity = variantCount[0]?.totalQuantity || 0;

                const newStatus = product.totalQuantity === 0 ? "out of stock" : "Available";
                if (product.status !== newStatus && product.status !== "Discontinued") {
                    await Product.findByIdAndUpdate(product._id, { status: newStatus });
                    product.status = newStatus;
                }

                const variants = await ProductVariant.find({ 
                    productId: product._id,
                    isActive: true 
                });
                product.availableColors = [...new Set(variants.map(v => v.color))];
                product.availableSizes = [...new Set(variants.map(v => v.size))];
            }

            const count = await Product.countDocuments({
                productName: { $regex: new RegExp(".*" + search + ".*", "i") },
              
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
                    message: req.flash('success')
                });
            } else {
                res.render('page-404');
            }
        } else {
            res.redirect('/admin/login');  
        }
    } catch (error) {
        console.error('Pagination Error:', error);
        res.redirect('/pageerror');
    }
};



const getaddProduct = async (req, res) => {
    try {
        if(req.session.admin) {
            const category = await Category.find({isListed: true});
            res.render("addProducts", {
                cat: category,
                messagess: req.flash()
            });
        } else {
            res.redirect('/admin/login');
        }
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const addProducts = async (req, res) => {
    try {
        const products = req.body;

        if (!products.productName || !products.description || !products.category || 
            !products.regularPrice || !products.salePrice || !products.color) {
            req.flash('error', 'All required fields must be filled');
            return res.redirect('/admin/products/addProducts');
        }

        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if (productExists) {
            req.flash('error', 'Product already exists. Please try another name');
            return res.redirect('/admin/products/addProducts');
        }

        const images = [];
        if (!req.files || req.files.length === 0) {
            req.flash('error', 'At least one image is required');
            return res.redirect('/admin/products/addProducts');
        }

        const uploadDir = path.join('public', 'uploads', 'product-images');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        for (let file of req.files) {
            const resizedImagePath = path.join(uploadDir, file.filename);
            await sharp(file.path)
                .resize({ width: 440, height: 440 })
                .toFile(resizedImagePath);
            images.push(file.filename);
        }

        const categoryId = await Category.findOne({ name: products.category });
        if (!categoryId) {
            req.flash('error', 'Invalid Category name');
            return res.redirect('/admin/products/addProducts');
        }

        const sizeQuantities = {
            S: Number(products.sizeS) || 0,
            M: Number(products.sizeM) || 0,
            L: Number(products.sizeL) || 0,
            XL: Number(products.sizeXL) || 0,
            XXL: Number(products.sizeXXL) || 0
        };

        const totalQuantity = Object.values(sizeQuantities).reduce((sum, qty) => sum + qty, 0);
        if (totalQuantity === 0) {
            req.flash('error', 'At least one size must have quantity greater than 0');
            return res.redirect('/admin/products/addProducts');
        }

        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            category: categoryId._id,
            regularPrice: products.regularPrice,
            salePrice: products.salePrice,
            productImage: images,
            status: 'Available',
            availableColors: [products.color],
            availableSizes: Object.keys(sizeQuantities).filter(size => sizeQuantities[size] > 0)
        });

        await newProduct.save();

        const variants = Object.entries(sizeQuantities)
            .filter(([_, qty]) => qty > 0)
            .map(([size, quantity]) => ({
                productId: newProduct._id,
                color: products.color,
                size,
                quantity,
                images,
                isActive: true
            }));

        if (variants.length > 0) {
            await ProductVariant.insertMany(variants);
        }

        req.flash('success', 'Product added successfully');
        return res.redirect('/admin/products');

    } catch (error) {
        console.error("Error saving products:", error);
        req.flash('error', 'Error saving product');
        return res.redirect('/admin/products/addProducts');
    }
};

const addProductOffer = async (req, res) => {
    try {
        const { productId, percentage } = req.body;
        const parsedPercentage = parseInt(percentage);

        if (parsedPercentage < 0 || parsedPercentage > 100) {
            return res.json({ 
                status: false, 
                message: "Offer percentage must be between 0 and 100" 
            });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.json({ 
                status: false, 
                message: "Product not found" 
            });
        }

        if (product.category.categoryOffer > 0) {
            return res.json({ 
                status: false, 
                message: "This product's category already has a category offer",
                categoryOffer: product.category.categoryOffer
            });
        }

        product.originalSalePrice = product.salePrice;

        const discountAmount = Math.floor(product.regularPrice * (parsedPercentage/100));
        product.salePrice = Math.max(product.regularPrice - discountAmount, 0);
        product.productOffer = parsedPercentage;

        await product.save();
        res.json({ status: true });

    } catch (error) {
        console.error('Error in addProductOffer:', error);
        res.status(500).json({ 
            status: false, 
            message: "An error occurred" 
        });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ 
                status: false, 
                message: "Product not found" 
            });
        }

        if (product.originalSalePrice !== null) {
            product.salePrice = product.originalSalePrice;
            product.originalSalePrice = null;
        }
        
        product.productOffer = 0;
        
        await product.save();
        
        return res.status(200).json({ 
            status: true, 
            message: "Offer removed successfully" 
        });

    } catch (error) {
        console.error('Error in removeProductOffer:', error);
        return res.status(500).json({ 
            status: false, 
            message: "Internal server error" 
        });
    }
};

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: true}});
        res.redirect('/admin/products');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: false}});
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect('/pageerror');
    }
}

const getEditProduct = async (req, res) => {
    try {
        const id = req.params.id;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/pageNotFound');
        }

        const product = await Product.findOne({ _id: id }).populate('category').lean();
        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/admin/products');
        }

        const variants = await ProductVariant.find({ productId: id }).lean();

        product.size = {
            sizeS: 0,
            sizeM: 0,
            sizeL: 0,
            sizeXL: 0,
            sizeXXL: 0
        };

        variants.forEach(variant => {
            product.size[`size${variant.size}`] = variant.quantity;
        });
        product.totalQuantity = variants.reduce((sum, variant) => sum + variant.quantity, 0);

        if (variants.length > 0) {
            product.color = variants[0].color;
        }

        const category = await Category.find({});
        res.render('editProduct', {
            product: product,
            cat: category,
            messages: req.flash('error')
        });
    } catch (error) {
        console.error('Error in getEditProduct:', error);
        res.redirect('/pageerror');
    }
};


const editProduct = async (req, res) => {
    try {
        const id = req.params.id;

        if (!id) {
            req.flash('error', 'Product ID is required');
            return res.redirect('/admin/products');
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            req.flash('error', 'Product not found');
            return res.redirect('/admin/products');
        }

        const data = req.body;

        const categoryId = await Category.findById(data.category);
        if (!categoryId) {
            req.flash('error', 'Invalid category');
            return res.redirect('/admin/products');
        }

        const duplicateProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });

        if (duplicateProduct) {
            req.flash('error', 'Product name already exists');
            return res.redirect(`/admin/products/editProduct/${id}`);
        }

        const images = req.files?.map(file => file.filename) || [];
        const finalImages = images.length > 0 ? images : existingProduct.productImage;

        const sizeData = {
            S: parseInt(data.sizeS) || 0,
            M: parseInt(data.sizeM) || 0,
            L: parseInt(data.sizeL) || 0,
            XL: parseInt(data.sizeXL) || 0,
            XXL: parseInt(data.sizeXXL) || 0
        };

        const availableSizes = Object.keys(sizeData).filter(size => sizeData[size] > 0);
        const totalQuantity = Object.values(sizeData).reduce((sum, val) => sum + val, 0);

        const updateFields = {
            productName: data.productName,
            description: data.description,
            category: categoryId._id,
            regularPrice: parseFloat(data.regularPrice),
            salePrice: parseFloat(data.salePrice),
            availableSizes: availableSizes,
            status: totalQuantity > 0 ? "Available" : "out of stock",
        };

        if (images.length > 0) {
            updateFields.productImage = images;
        }

        const existingColor = existingProduct.availableColors?.[0] || '';
        if (data.color !== existingColor) {
            updateFields.availableColors = [data.color];
        }

        await Product.findByIdAndUpdate(
            id,
            updateFields,
            { new: true, runValidators: true }
        );

        const variants = [];
        const color = data.color;

        for (const size in sizeData) {
            if (sizeData[size] > 0) {
                variants.push({
                    productId: id,
                    color,
                    size,
                    quantity: sizeData[size],
                    images: finalImages
                });
            }
        }

        await ProductVariant.deleteMany({ productId: id });
        if (variants.length > 0) {
            await ProductVariant.insertMany(variants);
        }

        req.flash('success', 'Product updated successfully');
        return res.redirect('/admin/products');

    } catch (error) {
        console.error('Error in editProduct:', error);
        req.flash('error', 'Error updating product');
        return res.redirect('/admin/products');
    }
};
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

        await ProductVariant.updateMany(
            { productId: productIdToServer },
            { $pull: { images: imageNameToServer } }
        );

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

const getProductVariants = async (req, res) => {
    try {
        const productId = req.params.id;
        const variants = await ProductVariant.find({ productId }).lean();
        
        return res.json({ status: true, variants });
    } catch (error) {
        console.error('Error getting product variants:', error);
        return res.status(500).json({ status: false, message: 'Error fetching variants' });
    }
};

const addProductVariant = async (req, res) => {
    try {
        const { productId, color, size, quantity } = req.body;
        
        if (!productId || !color || !size || !quantity) {
            return res.status(400).json({ status: false, message: 'Missing required fields' });
        }
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ status: false, message: 'Product not found' });
        }
        
        const existingVariant = await ProductVariant.findOne({
            productId,
            color,
            size
        });
        
        if (existingVariant) {
            return res.status(400).json({ status: false, message: 'Variant already exists' });
        }
        
        const newVariant = new ProductVariant({
            productId,
            color,
            size,
            quantity: parseInt(quantity),
            images: product.productImage
        });
        
        await newVariant.save();
        
        const updateData = {};
        
        if (!product.availableColors.includes(color)) {
            updateData.availableColors = [...product.availableColors, color];
        }
        
        if (!product.availableSizes.includes(size)) {
            updateData.availableSizes = [...product.availableSizes, size];
        }
        
        if (Object.keys(updateData).length > 0) {
            await Product.findByIdAndUpdate(productId, { $set: updateData });
        }
        
        if (product.status === 'out of stock') {
            await Product.findByIdAndUpdate(productId, { status: 'Available' });
        }
        
        return res.json({ status: true, message: 'Variant added successfully', variant: newVariant });
    } catch (error) {
        console.error('Error adding variant:', error);
        return res.status(500).json({ status: false, message: 'Server error' });
    }
};

const updateProductVariant = async (req, res) => {
    try {
        const { variantId, quantity } = req.body;
        
        if (!variantId || quantity === undefined) {
            return res.status(400).json({ status: false, message: 'Missing required fields' });
        }
        
        const updatedVariant = await ProductVariant.findByIdAndUpdate(
            variantId,
            { quantity: parseInt(quantity) },
            { new: true }
        );
        
        if (!updatedVariant) {
            return res.status(404).json({ status: false, message: 'Variant not found' });
        }
        
        const productId = updatedVariant.productId;
        
        const totalQuantity = await ProductVariant.aggregate([
            { $match: { productId: new mongoose.Types.ObjectId(productId) } },
            { $group: { _id: null, total: { $sum: "$quantity" } } }
        ]);
        
        const productStatus = totalQuantity[0]?.total > 0 ? 'Available' : 'out of stock';
        await Product.findByIdAndUpdate(productId, { status: productStatus });
        
        return res.json({ status: true, message: 'Variant updated successfully' });
    } catch (error) {
        console.error('Error updating variant:', error);
        return res.status(500).json({ status: false, message: 'Server error' });
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
    deleteSingle,
    getProductVariants,
    addProductVariant,
    updateProductVariant
};