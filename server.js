const express = require('express');
 const app = express();
 const env = require('dotenv').config()
 const path = require('path')
 const connectDB =require('./config/db')
 const userRoutes = require('./routes/userRouter')

 connectDB();
 app.use(express.json());
 app.use(express.urlencoded({extended:true}))

 app.set('view engine','ejs');
 app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
 app.use(express.static(path.join(__dirname, 'public')));
 app.use('/',userRoutes)

 const HOST = 'http://localhost';

app.listen(process.env.PORT,()=>console.log(`Server is running at ${HOST}:${process.env.PORT}`))

module.exports = app;


 
