const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null

    },
    googleId: {
        type: String,
        unique: true
    },
    password: {
        type: String,
        unique: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },

    createdOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String,
        //  required:true
    },
    myCode: {
        type: String,
    },

    redeemedUser: {
        type: Schema.Types.ObjectId,
        ref: "Coupon",
        default: null
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
})

const User = mongoose.model("User", userSchema);

module.exports = User;