const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const Wallet = require('../models/walletSchema');
const crypto = require('crypto');
const env = require('dotenv').config();

// Helper function to generate referral code
const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Helper function to create wallet and handle referral
const createWalletAndHandleReferral = async (userId) => {
    try {
        const newWallet = new Wallet({
            user: userId,
            balance: 0,
            transaction: []
        });
        await newWallet.save();
    } catch (error) {
        console.error('Error creating wallet:', error);
        throw error;
    }
};

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    scope: ['profile', 'email'],
    prompt: 'select_account'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
            if (user.isBlocked) {
                return done(null, false, { message: 'You are blocked!' });
            }
            return done(null, user);
        } else {
            // Generate referral code for new user
            const myCode = generateReferralCode();
            
            // Create new user with referral code
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                myCode: myCode, // Add referral code
                isVerified: true
            });
            await user.save();

            // Create wallet for the new user
            await createWalletAndHandleReferral(user._id);

            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user);
        })
        .catch(err => {
            done(err, null);
        });
});

module.exports = passport;