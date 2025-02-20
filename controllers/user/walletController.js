const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const { v4: uuidv4 } = require('uuid');

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
            totalDebit
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


module.exports = {
    getWallet,
    getTransactionHistory
};