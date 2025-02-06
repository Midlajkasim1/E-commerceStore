const mongoose = require('mongoose');
const {Schema} = mongoose;
const couponSchema = new mongoose.Schema({
    // couponId:{
    //   type:String,
    //   required:true
    // },
    name:{
        type:String,
        required:true,
        unique:true
    },
    createOn:{
        type:Date,
        default:Date.now,
        required:true
    },
    expireOn :{
        type:Date,
        required:true
    },
    offerPrice:{
        type:Number,
        required:true    
    },
    minimumPrice:{
        type:Number,
        required:true
    },
    isList:{
        type:Boolean,
        default:true
    },

    usedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
    // userId:[{
    //   type:mongoose.Schema.Types.ObjectId,
    //   ref:"User"
    // }]
})

const Coupon = mongoose.model("Coupon",couponSchema);
module.exports=Coupon;