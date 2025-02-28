const mongoose = require('mongoose');
const { Schema } = mongoose;

const productVariantSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  color: {
    type: String,
    required: true
  },
  size: {
    type: String,
    enum: ["S", "M", "L", "XL", "XXL"],
    required: true
  },
  quantity: {
    type: Number,
    default: 0,
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  },

}, { timestamps: true });

const ProductVariant = mongoose.model("ProductVariant", productVariantSchema);
module.exports = ProductVariant;