const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const Wallet = require('../models/walletSchema');
const crypto = require('crypto');
const env = require('dotenv').config();

const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
};

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
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
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
            const myCode = generateReferralCode();
            
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                myCode: myCode, 
                isVerified: true
            });
            await user.save();

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