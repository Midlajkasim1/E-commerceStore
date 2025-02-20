const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";  
    let page = parseInt(req.query.page) || 1;  
    
    const limit = 10;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: 'i' } },
        { email: { $regex: ".*" + search + ".*", $options: 'i' } },
      ],
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: 'i' } },
        { email: { $regex: ".*" + search + ".*", $options: 'i' } },
      ],
    }).countDocuments();

    const totalPages = Math.ceil(count / limit);


if(req.session.admin){
  
  res.render('customers', { 
    data: userData, 
    search: search,                          
    totalPages: totalPages, 
    currentPage: page 
  });
}
  
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
}

//customer blocked

const customerBlocked = async (req,res)=>{
    try {
       let id = req.query.id;
       await User.updateOne({_id:id},{$set:{isBlocked:true}});
       res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pageerror')
        
    }
};
//customerunBlocked

const customerunBlocked = async (req,res)=>{
     try {
    let id = req.query.id;
    await User.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect("/admin/users")
        
     } catch (error) {
        res.redirect('/pageerror')
     }
}






module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,

};
