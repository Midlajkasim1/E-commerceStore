const Category = require('../../models/categorySchema');


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





module.exports ={
    categoryInfo,
    addCategory,
    loadAddCategory,
    getListCategory,
    getUnListCategory,
    getEditCategory,
    editCategory

}



