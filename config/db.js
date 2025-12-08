const mongoose = require('mongoose');

let isConnected = false; 
const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    isConnected = db.connections[0].readyState === 1;
    console.log("MongoDB connected (Vercel serverless)");
  } 
  catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
};

module.exports = connectDB;
