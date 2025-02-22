const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },
  regularPrice: {
    type: Number,
    required: true,
  },
  salePrice: {
    type: Number,
    required: true
  },
  productOffer: {
    type: Number,
    default: 0
  },
  originalSalePrice: {
    type: Number,
    default: null
  },
  productImage: {
    type: [String],
    required: true
  },
  averageRating: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ["Available", "out of stock", "Discontinued"],
    required: true,
    default: "Available",
  },
  hasVariants: {
    type: Boolean,
    default: true
  },
 
}, { timestamps: true });

productSchema.virtual('totalQuantity').get(function() {
  return this._totalQuantity || 0;
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;