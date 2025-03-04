const mongoose = require('mongoose');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');


const categoryInfo = async (req,res)=>{
    try {
       
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        const categoryData = await Category.find({})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments()
        const totalPages = Math.ceil(totalCategories / limit);
     if(req.session.admin){
            res.render("category",{message:req.flash("categoryAdded"),

                cat:categoryData,
                msg: req.flash('categoryEdited'),
                currentPage:page,
                totalPages:totalPages,
                totalCategories:totalCategories
    
            })
        }

    } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
        
    }
}

const loadAddCategory = async (req,res) =>{
     try {
       res.render('addCategory',{message:req.flash("categoryExistingMessage")})
     } catch (error) {
        console.error(error);
        res.redirect("/pageerror")
     }
}



const addCategory = async(req,res)=>{ 
    const {name,description} = req.body;
    
    try {
       if(!name || !description){
        req.flash('categoryExistingMessage','please fill the form!')
        return res.redirect('/admin/category/addCategory')
       }
        const existingCategory = await Category.findOne({name:name});
        if(existingCategory){
            req.flash('categoryExistingMessage','Category already exists.')
            return res.redirect('/admin/category/addCategory')
        }
        const newCategory = {
            name: name,
            description: description
        }
        await Category.insertMany(newCategory);
        req.flash('categoryAdded', 'category added Successfully.')
        
        res.redirect('/admin/category')

    } catch (error) {
        return res.status(500).json({error:"Internal Server Errors"});
    

    }
}

const getListCategory = async (req,res)=>{
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
    
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror')
    }
}

const getUnListCategory = async (req,res)=>{
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect('/admin/category')
    } catch (error) {
        res.redirect('/pageerror')
    }
}

// get edit category

 const getEditCategory = async (req,res)=>{
    try {
        const id = req.query.id;
         if (!id || !mongoose.Types.ObjectId.isValid(id)) {
                    return res.redirect('/pageNotFound');
          }
        if(req.session.admin){
    const category = await Category.findOne({_id:id});
    res.render('editCategory',{category:category})
    }
    } catch (error) {
        res.redirect('/pageerror')
    }
 }
 
 //editCategory

 const editCategory = async (req,res)=>{

    try {
        const id = req.params.id;
        const data={
            name:req.body.name,
            description:req.body.description
        }
       
        await Category.updateOne(
            {_id:id},
            {$set: data}
        )
        req.flash('categoryEdited','Category Edited Sucessfully.')
        return res.redirect('/admin/category')
    } catch (error) {
        res.status(500).json({error:"Internal server error"})
    }
 }

 //add category offer
 const addCategoryOffer = async (req, res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;

        if (percentage < 0 || percentage > 100) {
            return res.json({ 
                status: false, 
                message: "Offer percentage must be between 0 and 100" 
            });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ 
                status: false, 
                message: "Category not found" 
            });
        }

        const products = await Product.find({ category: categoryId });

        const hasHigherOffer = products.some(product => 
            product.productOffer > percentage
        );

        if (hasHigherOffer) {
            return res.json({
                status: false, 
                message: "Some products have higher individual offers"
            });
        }

        await Category.updateOne(
            { _id: categoryId },
            { $set: { categoryOffer: percentage } }
        );

        for (let product of products) {
            if (!product.originalSalePrice) {
                product.originalSalePrice = product.salePrice;
            }

            const discountAmount = Math.floor(product.regularPrice * (percentage/100));
            product.salePrice = Math.max(product.regularPrice - discountAmount, 0);
            product.productOffer = 0; 

            await product.save();
        }

        res.json({ status: true });

    } catch (error) {
        console.error('Error in addCategoryOffer:', error);
        res.status(500).json({ 
            status: false, 
            message: "An error occurred" 
        });
    }
};


const removeCategoryOffer = async (req, res) => {
    try {
        const categoryId = req.body.categoryId;

        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found" });
        }

        const products = await Product.find({ category: category._id});

        if(products.length > 0) {
            for (let product of products) {
                if (product.originalSalePrice) {
                    product.salePrice = product.originalSalePrice;
                    product.originalSalePrice = null;
                } else {
                    product.salePrice = product.regularPrice;
                }
                product.productOffer = 0;
                await product.save()
            }
        }
        
        category.categoryOffer = 0;
        await category.save();
        
        res.status(200).json({ status: true, message: "Category offer removed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

module.exports ={
    categoryInfo,
    addCategory,
    loadAddCategory,
    getListCategory,
    getUnListCategory,
    getEditCategory,
    editCategory,
    addCategoryOffer,
    removeCategoryOffer

}



