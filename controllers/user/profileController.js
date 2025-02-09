const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const bcrypt = require('bcrypt');



const getUserProfile = async (req,res)=>{
    try {
        const userId = req.session.user;
        const userData= await User.findById(userId);
        const addressData = await Address.findOne({userId: userId})
        res.render('profile',{
            user:userData,
            userAddress:addressData,
            message:req.flash('')
        })
    } catch (error) {
        console.error('profile page not found',error);
        res.redirect('/pageNotFound')
    }
}
//
const getEditProfile = async (req,res)=>{
 try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    res.render('edit-userProfile', {
        user: userData,
        message: req.flash('')
    });
 } catch (error) {
    
 }

}

const editProfile =async (req,res)=>{
    try {
        const userId = req.session.user;
        const {name,phone} = req.body;
        if (!name || !phone) {
            req.flash('err', 'Name and phone are required.');
            return res.redirect('/edit-profile');
        }
        const updateUser = await User.findByIdAndUpdate(userId,
            {name,phone},
            {new:true}
        )
        if (!updateUser) {
            req.flash('err', 'User not found.');
            return res.redirect('/edit-profile');
        }
        req.flash('success', 'Profile updated successfully.');       
         res.redirect('/userProfile');

    } catch (error) {
        console.error('Error updating profile:', error);
        req.flash('err', 'Failed to update profile. Please try again.');
        res.redirect('/edit-profile');
    }
}







//password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            req.flash('err', 'All fields are required.');
            return res.redirect('/userProfile');
        }

        if (newPassword !== confirmNewPassword) {
            req.flash('err', 'New password and confirm password must match.');
            return res.redirect('/userProfile');
        }

      
        if (!req.session.user) {
            req.flash('err', 'You must be logged in to change your password.');
            return res.redirect('/login');
        }

        const user = await User.findById(req.session.user);
        if (!user) {
            req.flash('err', 'User not found.');
            return res.redirect('/userProfile');
        }


        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash('err', 'Current password is incorrect.');
            return res.redirect('/userProfile');
        }

 
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        req.flash('success', 'Password updated successfully.');
        return res.redirect('/userProfile');
    } catch (error) {
        console.error('Error changing password:', error);
        req.flash('err', 'Server error. Please try again later.');
        return res.redirect('/userProfile');
    }
};

const getAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData= await User.findById(userId);

        // console.log('Getting addresses for user ID:', userId);

        const userAddress = await Address.findOne({ userId: userId });
        // console.log('Found address:', userAddress);

        if (!userAddress) {
            console.log('No address found for user.');
            return res.render('address', {
                user: userData,
                userAddress: null,
                message: req.flash('err')
            });
        }

        res.render('address', {
            user: userData,
            userAddress: userAddress,
            message: req.flash('err')
        });
    } catch (error) {
        console.error('Error in getAddress:', error);
        req.flash('err', 'Failed to fetch addresses.');
        res.redirect('/pageNotFound');
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressType, name, phone, altPhone, landMark, city, state, pincode } = req.body;

        // Validation
        if (!addressType || !name || !phone || !landMark || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        let userAddress = await Address.findOne({ userId: userId });

        if (!userAddress) {
            userAddress = new Address({
                userId: userId,
                address: [{
                    addressType,
                    name,
                    phone,
                    altPhone,
                    landMark,
                    city,
                    state,
                    pincode
                }]
            });
        } else {
            userAddress.address.push({
                addressType,
                name,
                phone,
                altPhone,
                landMark,
                city,
                state,
                pincode
            });
        }

        await userAddress.save();
        req.flash('err','Address added successfully')
       
        res.status(200).json({ success: true, message: 'Address added successfully.' });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ success: false, message: 'Failed to add address. Please try again.' });
    }
};

const getEditAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;

        const currAddress = await Address.findOne({ "address._id": addressId });
        if (!currAddress) {
            req.flash('err', 'Address not found.');
            return res.redirect('/myaddress');
        }

        const addressData = currAddress.address.find((item) => {
            return item._id.toString() === addressId.toString();
        });

        if (!addressData) {
            req.flash('err', 'Address not found.');
            return res.redirect('/myaddress');
        }

        res.render('edit-address', {
            address: addressData,
            user: user,
            message: req.flash('err')
        });
    } catch (error) {
        console.error('Error in getEditAddress:', error);
        req.flash('err', 'Failed to fetch address details.');
        res.redirect('/myaddress');
    }
};

const editAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.body.addressId;

        // Validation
        if (!data.addressType || !data.name || !data.phone || !data.landMark || !data.city || !data.state || !data.pincode) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const updateResult = await Address.updateOne(
            { "address._id": addressId },
            {
                $set: {
                    "address.$": {
                        _id: addressId,
                        addressType: data.addressType,
                        name: data.name,
                        city: data.city,
                        landMark: data.landMark,
                        state: data.state,
                        pincode: data.pincode,
                        phone: data.phone,
                        altPhone: data.altPhone
                    }
                }
            }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ success: false, message: 'Address not found during update.' });
        }

        if (updateResult.modifiedCount === 0) {
            return res.status(400).json({ success: false, message: 'No changes made to address.' });
        }

        res.status(200).json({ success: true, message: 'Address updated successfully.' });
    } catch (error) {
        console.error('Error in editAddress:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const findAddress = await Address.findOne({ "address._id": addressId });

        if (!findAddress) {
            req.flash('err', 'Address not found.');
            return res.redirect('/myaddress');
        }

        await Address.updateOne(
            { "address._id": addressId },
            { $pull: { address: { _id: addressId } } }
        );

        req.flash('err', 'Address deleted successfully.');
        res.redirect('/myaddress');
    } catch (error) {
        console.error('Error in deleteAddress:', error);
        req.flash('err', 'Failed to delete address.');
        res.redirect('/myaddress');
    }
};
module.exports={
    getUserProfile,
    getEditProfile,
    editProfile,
    getAddress,
    postAddAddress,
    getEditAddress,
    editAddress,
    deleteAddress,
    changePassword
  
}
