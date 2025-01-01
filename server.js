const express = require('express');
 const app = express();
 const env = require('dotenv').config()
 const connectDB =require('./config/db')

 app.get('/',(req,res)=>{
    res.send('hello start')
 })

connectDB();
 const HOST = 'http://localhost';

app.listen(process.env.PORT,()=>console.log(`Server is running at ${HOST}:${process.env.PORT}`))

module.exports = app;


 
