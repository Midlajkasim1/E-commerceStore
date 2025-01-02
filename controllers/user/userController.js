const User = require('../../models/userSchema')


const loadSignup = async(req,res)=>{
    try {
         res.render('signup')
    } catch (error) {
        console.log("home page not found");
        res.status(500).send("Server error")
                
    }
}
const signup = async(req,res)=>{
    const {name,email,phone,password} = req.body;


    try {

         const newUser = new User({name,email,phone,password});
         console.log(newUser);
         await newUser.save();
         
         
         return res.redirect('/signup')

    } catch (error) {
        console.error("signup page error",error);
        res.status(500).send("Server error")
    }
}



const pageNotFound = async(req,res) =>{
    try {
        res.render('page-404')
        
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}




const loadHomePage = async(req,res)=>{
    try {
        return res.render('home')
    } catch (error) {
         console.log("home page not found");
         res.status(500).send("Server error")
         
    }
}

module.exports ={
    loadHomePage,
    pageNotFound,
    loadSignup,
    signup
}