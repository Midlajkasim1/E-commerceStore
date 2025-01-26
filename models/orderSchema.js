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
        default: "Pending",
        enum: ["Pending", "Processing", "Shipped", "Out for Delivery", "Delivered", "Cancelled", "Returned"] 
    }
    }],
    totalPrice: {
      type: Number,
      required: true
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
    trackingInfo: {
     trackingNumber: String,
     courier: String,
     estimatedDelivery: Date
    },
    status: {
     type: String,
     required: true,
     enum: ["Pending","Processing","Shipped","Out for Delivery","Delivered","Cancelled","Returned"]
    },
    paymentMethod: {
        type: String,
        required: true, 
    },
    createOn: {
     type: Date,
     default: Date.now,
     required: true
    }
 });
 
const Order = mongoose.model("Order",orderSchema);

module.exports=Order;