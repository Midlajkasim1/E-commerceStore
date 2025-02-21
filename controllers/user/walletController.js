const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const walletData = await Wallet.findOne({ user: userId });
        const filterType = req.query.type || 'all';

        let transactions = [];

        if (walletData && walletData.transaction) {
            transactions = walletData.transaction
                .filter(trans => {
                    if (filterType === 'all') return true;
                    return trans.type === filterType;
                })
                .map(trans => ({
                    ...trans.toObject(),
                    formattedDate: trans.createdAt ? new Date(trans.createdAt).toLocaleDateString() : 'N/A'
                }))
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5);
        }

        // Calculate totals
        const totalCredit = walletData ? walletData.transaction
            .filter(trans => trans.type === 'credit')
            .reduce((sum, trans) => sum + trans.amount, 0) : 0;

        const totalDebit = walletData ? walletData.transaction
            .filter(trans => trans.type === 'debit')
            .reduce((sum, trans) => sum + trans.amount, 0) : 0;

        res.render('wallet', {
            user: userData,
            wallet: walletData || { balance: 0, transaction: [] },
            recentTransactions: transactions,
            filterType,
            totalCredit,
            totalDebit,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID  

        });
    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
};


const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.session.user;
        const wallet = await Wallet.findOne({ user: userId });
        const userData = await User.findById(userId);

        if (!wallet) {
            return res.render('transaction-history', {
                user: userData,
                transactions: [],
                message: 'No transactions found',
                wallet: { balance: 0 }
            });
        }

        const transactions = wallet.transaction.map(trans => ({
            ...trans.toObject(),
            formattedDate: trans.createdAt ? new Date(trans.createdAt).toLocaleDateString() : 'N/A',
            formattedAmount: `${trans.type === 'credit' ? '+' : '-'}₹${trans.amount}`,
            isReferral: trans.productName && (trans.productName.includes('Referral Bonus') || trans.productName.includes('Welcome Bonus'))
        })).sort((a, b) => b.createdAt - a.createdAt);

        res.render('transaction-history', {
            user: userData,
            transactions: transactions,
            wallet: wallet
        });
    } catch (error) {
        console.error('Transaction history error:', error);
        res.redirect('/pageNotFound');
    }
};
const createWalletOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user;



        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid amount"
            });
        }

        // Verify Razorpay configuration
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Razorpay credentials missing');
            return res.status(500).json({
                success: false,
                message: "Payment configuration error"
            });
        }

        const shortUserId = userId.slice(-8);
        const timestamp = Date.now().toString().slice(-10);
        const receiptId = `w_${shortUserId}_${timestamp}`;

        const options = {
            amount: Math.round(amount * 100), 
            currency: "INR",
            receipt: receiptId
        };


        const order = await razorpayInstance.orders.create(options);
        

        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            receipt: receiptId,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Error creating wallet order:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error creating order"
        });
    }
};
const verifyWalletPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount
        } = req.body;

        const userId = req.session.user;

        // Verify Razorpay signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment signature"
            });
        }

        // Find or create wallet
        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transaction: []
            });
        }

        // Add credit transaction
        wallet.transaction.push({
            amount: parseFloat(amount),
            transactionId: razorpay_payment_id,
            productName: ["Wallet Recharge"],
            type: "credit",
            createdAt: new Date()
        });

        // Update balance
        wallet.balance += parseFloat(amount);
        
        await wallet.save();

        res.json({
            success: true,
            message: "Payment verified and wallet updated successfully",
            currentBalance: wallet.balance
        });
    } catch (error) {
        console.error("Error verifying wallet payment:", error);
        res.status(500).json({
            success: false,
            message: "Error processing payment"
        });
    }
};

// Add money to wallet helper function
const addMoneyToWallet = async (userId, amount, transactionId, description = "Wallet Recharge") => {
    try {
        let wallet = await Wallet.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new Wallet({
                user: userId,
                balance: 0,
                transaction: []
            });
        }

        wallet.transaction.push({
            amount: amount,
            transactionId: transactionId,
            productName: [description],
            type: "credit",
            createdAt: new Date()
        });

        wallet.balance += amount;
        await wallet.save();

        return {
            success: true,
            currentBalance: wallet.balance
        };
    } catch (error) {
        throw new Error(`Error adding money to wallet: ${error.message}`);
    }
};

module.exports = {
    getWallet,
    getTransactionHistory,
    createWalletOrder,
    verifyWalletPayment,
    addMoneyToWallet
};