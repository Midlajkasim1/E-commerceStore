const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
  try {
      // First check if user session exists
      if (!req.session.user) {
          return res.redirect('/login');
      }

      // Always check user's current status in database
      const user = await User.findById(req.session.user);
      
      // If user doesn't exist or is blocked
      if (!user || user.isBlocked) {
          // Clear the session since user is blocked or deleted
          req.session.destroy((err) => {
              if (err) {
                  console.log("Error destroying session:", err);
              }
          });
          return res.redirect('/login');
      }

      // User exists and is not blocked
      req.user = user;
      next();

  } catch (error) {
      console.log("Error in user auth middleware:", error);
      // Clear session on error to be safe
      req.session.destroy((err) => {
          if (err) {
              console.log("Error destroying session:", err);
          }
      });
      return res.status(500).send("Internal Server error");
  }
};


const blockCheck = async (req, res, next) => {
  try {
      // Only proceed if there's a user session
      const userId = req.session.user;
      if (!userId) {
          return next();
      }

      // Get latest user data to check block status
      const userData = await User.findById(userId);
      
      // If user is blocked, just remove their session
      if (userData?.isBlocked) {
          req.session.destroy((err) => {
              if (err) {
                  console.log("Error destroying session:", err);
              }
          });
      }

      // Continue either way
      next();

  } catch (error) {
      console.log("Error in block check middleware:", error);
      next();
  }
};





const adminAuth = (req,res,next)=>{
  User.findOne({isAdmin:true})
  .then(data=>{
    if(data){
      next();
    }else{
      res.redirect("/admin/login")
    }
  })
  .catch(error=>{
    console.log("Error in adminauth middleware",error);;
    res.status(500).send("Internal Server Error")
    
  })
}

const adminCheck = (req,res,next)=>{
  if(req.session.admin){
    next();
  }else{
    res.redirect('/admin/login')
  }
}




module.exports = {
  userAuth,
  adminAuth,
  blockCheck,
  adminCheck,
}
