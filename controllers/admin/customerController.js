const User = require('../../models/userSchema');

const customerInfo = async (req, res) => {
  try {
    // Initialize search and page variables
    let search = req.query.search || "";  // Default to an empty string if no search query
    let page = parseInt(req.query.page) || 1;  // Default to page 1 if no page query
    
    const limit = 10;  // Define your limit (e.g., 10 users per page)

    // Query the database for users matching the search term and pagination
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

    // Get the total number of users that match the search criteria
    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: 'i' } },
        { email: { $regex: ".*" + search + ".*", $options: 'i' } },
      ],
    }).countDocuments();

    // Calculate total pages for pagination
    const totalPages = Math.ceil(count / limit);

    // Render the page and pass the necessary variables
    res.render('customers', { 
      data: userData, 
      search: search,  // Pass search term to the view
      totalPages: totalPages, 
      currentPage: page 
    });
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
