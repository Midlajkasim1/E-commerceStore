const mongoose = require('mongoose');
const {Schema} =mongoose;

const productSchema = new mongoose.Schema({
  productName:{
     type:String,
     required:true,
  },
  description:{
    type:String,
    required:true,
  },
  category:{
    type:Schema.Types.ObjectId,
    ref:"Category",
    required:true,

  },
  regularPrice:{
    type:Number,
    required:true,
  },
  salePrice:{
    type:Number,
    required:true
  },
  productOffer:{
    type:Number,
    default:0
  },
  originalSalePrice: {
    type: Number,
    default: null
  },
  
  quantity:{
    type:Number,
    default:true
  },
  color:{
    type:String,
    required:true
  },
  productImage:{
    type:[String],
    required:true
  },
  averageRating: {
    type: Number,
    default: 0
},
totalReviews: {
    type: Number,
    default: 0
},
  isBlocked:{
    type:Boolean,
    default:false 
  },
  status:{
    type:String,
    enum:["Available","out of stock","Disconnected"],
    required:true,
    default:"Available",
  },
  size: {
    sizeS: {
        type: Number,
        default: 0
    },
    sizeM: {
        type: Number,
        default: 0
    },
    sizeL: {
        type: Number,
        default: 0
    },
    sizeXL: {
        type: Number,
        default: 0
    },
    sizeXXL: {
        type: Number,
        default: 0
    }
},
},{timestamps:true})

const Product = mongoose.model("Product",productSchema);

 module.exports = Product;