const mongoose = require('mongoose');
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid');

const orderSchema = new mongoose.Schema({
    orderId: {
     type: String,
     default: () => uuidv4(),
     unique: true
    },
    userId: {
     type: Schema.Types.ObjectId,
     ref: "User",
     required: true
    },
    orderedItems: [{
     product: {
         type: Schema.Types.ObjectId,
         ref: "Product",
         required: true
     },
     variant: {  
        type: Schema.Types.ObjectId,
        ref: "ProductVariant",
        required: true
    },
     productName: {  
        type: String,
        required: false
    },
     quantity: {
         type: Number,
         required: true
     },
     price: {
        type: Number,
        default: 0
     },
     size: {
        type: String
     },
     status: { 
        type: String,
        required: true,
        enum: ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned", "Return Request","Payment Failed","failed"]
    },
    cancellationReason: {
        type: String,
        default: null
      },
      returnReason: {
        type: String,
        default: null
    },
    returnDeclinedReason: {
        type: String
    },
    deliveredDate:{
        type:Date
    }
    }],
    totalPrice: {
      type: Number,
      required: true
    },
    
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
     type: Number,
     required: true
    },
    address: {
     type: Schema.Types.ObjectId,
     ref: "Address",
     required: true
    },
    shippingAddress: {
        addressType: String,
        name: String,
        city: String,
        landMark: String,
        state: String,
        pincode: Number,
        phone: String,
        altPhone: String
    },
    trackingInfo: {
     trackingNumber: String,
     courier: String,
     estimatedDelivery: Date
    },
    status: {
     type: String,
     required: true,
     enum: ["Pending","Processing","Shipped","Out for Delivery","Delivered","Cancelled","Returned","Return Request","failed","completed"]
    },
    paymentMethod: {
        type: String,
        required: true, 
    },
    createOn: {
     type: Date,
     default: Date.now,
     required: true
    },
    deliveredAt: {
        type: Date
    }
 });
 
const Order = mongoose.model("Order",orderSchema);

module.exports=Order;