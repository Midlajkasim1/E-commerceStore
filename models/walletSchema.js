const mongoose = require('mongoose');
const { schema } = mongoose;

const walletSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    balance: {
        type: Number,
        default: 0

    },
    transaction: [{
        amount: {
            type: Number
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        transactionId: {
            type: String
        },
        productName: {
            type: [String],
        },
        type: {
            type: String,
            enum: ["credit", 'debit']
        }
    }]
})

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
