const mongoose = require('mongoose');
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new mongoose.Schema({
   orderId :{
    type:String,
    default:()=>uuidv4(),
    unique:true
   },
   orderedItems:[{
    product:{
        type:Schema.Types.orderId,
        ref:"Product",
        required:true
    },
    quantity:{
        type:Number,
        required:true
    },
    price:{
       type:Number,
       default:0
      }
   }],
   totalPrice:{
     type:Number,
     required:true
   },
   discount:{  //use coupo for discount
    type:Number,
    default:0       
   },
   finalAmount:{
    type:Number,
    required:true
   },
   address:{
    type:Schema.Types.ObjectId,
    ref:"User",
    required:true
   },
   invoiceDate:{
    type:Date
   },
   status:{
    type:String,
    required:true,
    enum:["Pending","Processing","Shipped","Delivered","Cancel","Return Request","Returned"]
   },
   createOn:{
    type:Date,
    default:Date.now,
    required:true
   },
   couponApplied:{
    type:Boolean,
    default:false

   }

})

const Order = mongoose.model("Order",orderSchema);

module.exports=Order;