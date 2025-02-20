const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose')


const getCoupon = async (req,res)=>{
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10; 
        const skip = (page - 1) * limit;

        const totalCoupons = await Coupon.countDocuments({});
        const totalPages = Math.ceil(totalCoupons / limit);
        const findCoupons = await Coupon.find({})
        .sort({ createOn: -1 }) 
        .skip(skip)
        .limit(limit);

    const searchQuery = req.query.search;
    if (searchQuery) {
        findCoupons = await Coupon.find({
            name: { $regex: searchQuery, $options: 'i' }
        })
            .skip(skip)
            .limit(limit);
    }
        res.render('coupon',{
            coupons: findCoupons,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            lastPage: totalPages,
            search: searchQuery || '' ,
            messages:req.flash()
        })

    } catch (error) {
        console.error(error);
    }
}

const getAddCoupon = async (req,res)=>{
    try {
        
        res.render('addCoupon',{messages:req.flash()})
    } catch (error) {
        res.redirect('/pageerror')
    }
}
const addCoupon = async (req, res) => {
    try {
        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + "T00:00:00"),
            expiryDate: new Date(req.body.expiryDate + "T00:00:00"),
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice),
        };

        // Add date validation
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        if (data.startDate < currentDate) {
            return res.json({ 
                success: false, 
                message: 'Start date cannot be in the past' 
            });
        }

        if (data.expiryDate <= data.startDate) {
            return res.json({ 
                success: false, 
                message: 'Expiry date must be after start date' 
            });
        }

        const existingCoupon = await Coupon.findOne({ name: data.couponName });
        if (existingCoupon) {
            return res.json({ 
                success: false, 
                message: 'Coupon with this name already exists' 
            });
        }

        const newCoupon = new Coupon({
            name: data.couponName,
            createOn: data.startDate,
            expireOn: data.expiryDate,
            offerPrice: data.offerPrice,
            minimumPrice: data.minimumPrice
        });

        await newCoupon.save();
        return res.json({ 
            success: true, 
            message: 'Coupon added successfully' 
        });

    } catch (error) {
        console.error(error);
        return res.json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
};
 //list coupon

 const listCoupon = async (req,res)=>{
    try {
        let id = req.query.id;
        await Coupon.updateOne({_id:id},{$set:{isList:false}});
        res.redirect('/admin/coupon')

    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound')
    }
 }
 //unlist coupon

 const unListCoupon = async (req,res)=>{
    try {
        let id = req.query.id;
        await Coupon.updateOne({_id:id},{$set:{isList:true}});
        res.redirect('/admin/coupon')

    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound')
    }
 }








 const getEditCoupon = async (req,res)=>{
    try {
        const id = req.params.id;
        console.log("coupon ID :",id);
        
        if (!id) {
            return res.status(400).send('Coupon ID is required');
        }
        const  findCoupon = await Coupon.findOne({_id:id});
        console.log('Found Coupon:', findCoupon); 
        res.render('editCoupon',{
            findCoupon:findCoupon,

        });
    } catch (error) {
        res.redirect('/pageerror')
    }
 }


 const editCoupon = async (req, res) => {
    try {
        console.log('Received update request:', req.body);
        
        const couponId = req.body.couponId;
        
        // Validate coupon ID
        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).json({
                status: false,
                message: 'Invalid coupon ID'
            });
        }

        // Validate required fields
        const { couponName, startDate, expiryDate, offerPrice, minimumPrice, status } = req.body;
        
        if (!couponName || !startDate || !expiryDate || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                status: false,
                message: 'All fields are required'
            });
        }

        // Validate coupon name format
        if (!/^[A-Z0-9]+$/.test(couponName)) {
            return res.status(400).json({
                status: false,
                message: 'Coupon name must contain only uppercase letters and numbers'
            });
        }

        // Convert dates
        const startDateObj = new Date(startDate);
        const expiryDateObj = new Date(expiryDate);
        const currentDate = new Date();

        currentDate.setHours(0, 0, 0, 0);
        startDateObj.setHours(0, 0, 0, 0);
        expiryDateObj.setHours(0, 0, 0, 0);
        // Validate dates
        if (isNaN(startDateObj.getTime()) || isNaN(expiryDateObj.getTime())) {
            return res.status(400).json({
                status: false,
                message: 'Invalid date format'
            });
        }

        if (startDateObj < currentDate) {
            return res.status(400).json({
                status: false,
                message: 'Start date cannot be in the past'
            });
        }

        if (expiryDateObj <= startDateObj) {
            return res.status(400).json({
                status: false,
                message: 'Expiry date cannot be earlier than start date'
            });
        }

        // Convert and validate prices
        const offerPriceNum = parseFloat(offerPrice);
        const minimumPriceNum = parseFloat(minimumPrice);

        if (isNaN(offerPriceNum) || isNaN(minimumPriceNum) || offerPriceNum <= 0 || minimumPriceNum <= 0) {
            return res.status(400).json({
                status: false,
                message: 'Invalid price values'
            });
        }

        if (offerPriceNum >= minimumPriceNum) {
            return res.status(400).json({
                status: false,
                message: 'Offer price must be less than minimum price'
            });
        }


        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponId,
            {
                $set: {
                    name: couponName,
                    createOn: startDateObj,
                    expireOn: expiryDateObj,
                    offerPrice: offerPriceNum,
                    minimumPrice: minimumPriceNum,
                    updatedAt: new Date()
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({
                status: false,
                message: 'Coupon not found'
            });
        }

        return res.status(200).json({
            status: true,
            message: 'Coupon updated successfully',
            coupon: updatedCoupon
        });

    } catch (error) {
        console.error('Edit Coupon Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal server error'
        });
    }
};
const deleteCoupon = async (req, res) => {
    try {
        const id = req.params.id; 
        const result = await Coupon.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({
                status: false,
                message: 'Coupon not found'
            });
        }

        return res.status(200).json({
            status: true,
            message: 'Successfully deleted'
        });

    } catch (error) {
        console.error('Delete Error:', error);
        return res.status(500).json({
            status: false,
            message: 'Error deleting coupon'
        });
    }
};

module.exports ={
    getCoupon,
    getAddCoupon,
    addCoupon,
    listCoupon,
    unListCoupon,
    getEditCoupon ,
    editCoupon,
    deleteCoupon
    
}