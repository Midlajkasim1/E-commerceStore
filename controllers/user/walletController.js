const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const { v4: uuidv4 } = require('uuid');



const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const walletData = await Wallet.findOne({ user: userId });

        // Get recent transactions
        const transactions = walletData ? walletData.transaction.sort((a, b) => 
            b.createdAt - a.createdAt).slice(0, 5) : [];

        res.render('wallet', { 
            user: userData,
            wallet: walletData || { balance: 0, transaction: [] },
            recentTransactions: transactions
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
        
        if (!wallet) {
            return res.render('transaction-history', {
                user: await User.findById(userId),
                transactions: [],
                message: 'No transactions found'
            });
        }

        const transactions = wallet.transaction.sort((a, b) => b.createdAt - a.createdAt);

        res.render('transaction-history', {
            user: await User.findById(userId),
            transactions: transactions,
            wallet: wallet
        });
    } catch (error) {
        console.error('Transaction history error:', error);
        res.redirect('/pageNotFound');
    }
};



module.exports = {
    getWallet,
    getTransactionHistory
};