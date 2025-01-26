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
        req.flash('success', 'Profile updated successfully.');        res.redirect('/userProfile');

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

        // Validate input
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            req.flash('err', 'All fields are required.');
            return res.redirect('/userProfile');
        }

        if (newPassword !== confirmNewPassword) {
            req.flash('err', 'New password and confirm password must match.');
            return res.redirect('/userProfile');
        }

        // Check if user is logged in
        if (!req.session.user) {
            req.flash('err', 'You must be logged in to change your password.');
            return res.redirect('/login');
        }

        // Find user in the database
        const user = await User.findById(req.session.user);
        if (!user) {
            req.flash('err', 'User not found.');
            return res.redirect('/userProfile');
        }

        // Check current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash('err', 'Current password is incorrect.');
            return res.redirect('/userProfile');
        }

        // Hash new password and update
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




const getAddress = async(req,res)=>{
    try {
        const userId = req.session.user;  // This appears to be the ID string directly
        console.log('Getting addresses for user ID:', userId);

        const userAddress = await Address.findOne({ userId: userId });
        console.log('Found address:', userAddress);

        // Check MongoDB for all addresses (debug only)
        const allAddresses = await Address.find({});
        console.log('All addresses in DB:', allAddresses);

        res.render('address',{
            user: userId,
            userAddress: userAddress ,
            user: req.user || req.session.user  // Add this line explicitly
        });
    } catch (error) {
        console.error('Error in getAddress:', error);
        res.redirect('/pageNotFound');
    }
}

const postAddAdress = async (req, res) => {
    try {
        const userId = req.session.user;  // Use the ID string directly
        console.log('Adding address for user ID:', userId);

        const {addressType, name, phone, altPhone, landMark, city, state, pincode} = req.body;
        console.log('Address data to save:', {
            userId,
            addressType,
            name,
            phone,
            altPhone,
            landMark,
            city,
            state,
            pincode
        });

        let userAddress = await Address.findOne({ userId: userId });
        console.log('Existing address found:', userAddress);

        if (!userAddress) {
            userAddress = new Address({
                userId: userId,  // Use the ID string
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
            console.log('Created new address document:', userAddress);
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
            console.log('Added to existing address document:', userAddress);
        }
        
        const savedAddress = await userAddress.save();
        console.log('Successfully saved address:', savedAddress);

        return res.status(200).json({
            success: true,
            message: 'Address added successfully'
        });
    } catch (error) {
        console.error('Error adding address:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add address. Please try again.'
        });
    }
}

const getEditAddress = async (req,res) =>{
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id" :addressId,
        });
        if(!currAddress){
            return res.redirect('/pageNotFound')
        }
        const addressData = currAddress.address.find((item)=>{
            return item._id.toString() === addressId.toString()
        })
        if(!addressData){
            return res.redirect('/pageNotFound')
        }
        res.render('edit-address',{
            address: addressData,
            user:user
        })
    } catch (error) {
        console.log("error in  get edit address",error);
        res.redirect('/pageNotFound')
        
        
    }
}

const editAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.body.addressId; // Changed from req.query.id to req.body.addressId
        const userId = req.session.user._id;

        console.log('Debug Info:', {
            addressId,
            userId,
            data
        });

        // Find the address document
        const findAddress = await Address.findOne({ 
            "address._id": addressId 
        });

        console.log('Found Address Document:', findAddress);

        if (!findAddress) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        // Update the address
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

        console.log('Update Result:', updateResult);

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Address not found during update'
            });
        }

        if (updateResult.modifiedCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'No changes made to address'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Address updated successfully'
        });

    } catch (error) {
        console.error("Error in edit address:", error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

//
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            return res.status(404).send("Address no found!");
        }
        await  Address. updateOne(
            {"address._id":addressId},
            {$pull:{
                address:{
                    _id:addressId,
                }
            }}
        )
        res.redirect('/myaddress')
    } catch (error) {
        console.error("Error in delete address",error);
        res.redirect('/pageNotFound')
    }
};
module.exports={
    getUserProfile,
    getEditProfile,
    editProfile,
    getAddress,
    postAddAdress,
    getEditAddress,
    editAddress,
    deleteAddress,
    changePassword
  
}
