const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define the upload path
const uploadPath = path.join(__dirname, "../public/uploads/re-image");

// Ensure the upload path exists
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

module.exports = storage;
