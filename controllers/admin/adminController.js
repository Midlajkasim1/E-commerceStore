const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const bcrypt = require('bcrypt')
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const fs = require('fs');

const loadlogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');  
    }
    res.render("admin-login",{message:req.flash('err')});
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if(!email,!password){
            req.flash('err','Please enter the email and password!')
           return res.redirect('/admin/login')
        }
    

                
        if(!admin){
            req.flash('err','Invalid admin!');
            return res.redirect('/admin/login')
        }

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            console.log('Password match:', passwordMatch);
        

            if (!passwordMatch) {
               req.flash('err','Invalid Password!')
               return res.redirect('/admin/login')
               
            }else{
                req.session.admin = true;
                return res.redirect('/admin/dashboard');  
            }
            
        } else {
            return res.redirect('/admin/login'); 
        }
    } catch (error) {
        console.log('Login error:', error);
        return res.redirect('/pageerror');
    }
};

const loadDashboard = async (req, res) => {
    try {
        // Get time periods
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() - 1));

        // Calculate current period sales
        const currentPeriodSales = await Order.aggregate([
            { 
                $match: { 
                    status: 'Delivered',
                    createOn: { 
                        $gte: startOfMonth
                    }
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$finalAmount' }
                }
            }
        ]);

        // Calculate previous period sales
        const previousPeriodSales = await Order.aggregate([
            { 
                $match: { 
                    status: 'Delivered',
                    createOn: { 
                        $gte: lastMonth,
                        $lt: startOfMonth
                    }
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: '$finalAmount' }
                }
            }
        ]);

        // Calculate monthly order counts
        const monthlyOrders = await Order.aggregate([
            {
                $match: {
                    status: 'Delivered'
                }
            },
            {
                $group: {
                    _id: { 
                        month: { $month: '$createOn' },
                        year: { $year: '$createOn' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1
                }
            }
        ]);

        // Calculate total sales and orders
        const totalStats = await Order.aggregate([
            { 
                $match: { 
                    status: 'Delivered'
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    totalSales: { $sum: '$finalAmount' },
                    totalOrders: { $sum: 1 },
                    totalDiscount: { $sum: '$discount' }
                }
            }
        ]);

        // Calculate order status distribution
        const orderStatusDistribution = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get total users count
        const totalUsers = await User.countDocuments({ isBlocked: false });

        // Get user purchase history
        const userPurchaseHistory = await Order.aggregate([
            { 
                $match: { 
                    status: 'Delivered'
                }
            },
            {
                $group: {
                    _id: '$userId',
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$finalAmount' },
                    lastPurchase: { $max: '$createOn' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: '$userDetails'
            },
            {
                $project: {
                    name: '$userDetails.name',
                    email: '$userDetails.email',
                    totalOrders: 1,
                    totalSpent: 1,
                    lastPurchase: 1
                }
            },
            {
                $sort: { totalSpent: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // Calculate sales growth
        const currentSales = currentPeriodSales[0]?.total || 0;
        const previousSales = previousPeriodSales[0]?.total || 0;
        const salesGrowth = previousSales === 0 
            ? 100 
            : ((currentSales - previousSales) / previousSales) * 100;

        // Prepare status counts for the chart
        const statusCounts = {};
        orderStatusDistribution.forEach(status => {
            statusCounts[status._id] = status.count;
        });
        console.log("Current Period Sales:", currentPeriodSales);
        console.log("Previous Period Sales:", previousPeriodSales);
        console.log("Monthly Orders:", monthlyOrders);
        console.log("Total Stats:", totalStats);
        console.log("Order Status Distribution:", orderStatusDistribution);
        // const dashboardData = {
        //     totalSales: totalStats[0]?.totalSales || 0,
        //     totalOrders: totalStats[0]?.totalOrders || 0,
        //     totalDiscounts: totalStats[0]?.totalDiscount || 0,
        //     totalUsers,
        //     salesGrowth: parseFloat(salesGrowth.toFixed(1)),
        //     userPurchaseHistory,
        //     orderStatusCounts: statusCounts,
        //     monthlyOrderCounts: monthlyOrders
        // };

        res.render('dashboard', {
            totalSales: totalStats[0]?.totalSales || 0,
            totalOrders: totalStats[0]?.totalOrders || 0,
            totalDiscounts: totalStats[0]?.totalDiscount || 0,
            totalUsers,
            salesGrowth: parseFloat(salesGrowth.toFixed(1)),
            userPurchaseHistory,
            orderStatusCounts: statusCounts,
            monthlyOrderCounts: monthlyOrders
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
};

const downloadExcelReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const dateRange = {
            start: startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1)),
            end: endDate ? new Date(endDate) : new Date()
        };
        console.log("Date Range:", dateRange);

        const query = {
            createOn: { 
                $gte: dateRange.start, 
                $lte: dateRange.end 
            },
            status: 'Delivered'
        };
        console.log("Date Range:", dateRange);
        console.log("Query:", query);
        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderedItems.product', 'productName')
            .sort({ createOn: -1 })
            .lean();

            console.log("Orders Found:", orders);
            if (!orders || orders.length === 0) {
                return res.status(404).send('No orders found for the specified date range');
            }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Products', key: 'products', width: 30 },
            { header: 'Items', key: 'items', width: 10 },
            { header: 'Amount (₹)', key: 'amount', width: 15 },
            { header: 'Discount (₹)', key: 'discount', width: 15 },
            { header: 'Final Amount (₹)', key: 'finalAmount', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF8DB4E2' }
        };

        orders.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                date: order.createOn.toLocaleDateString(),
                customer: order.userId?.name || 'N/A',
                email: order.userId?.email || 'N/A',
                products: order.orderedItems
                    .map(item => item.product?.productName || 'N/A')
                    .join(', '),
                items: order.orderedItems.length,
                amount: order.totalPrice,
                discount: order.discount,
                finalAmount: order.finalAmount
            });
        });

        const summary = {
            totalOrders: orders.length,
            totalSales: orders.reduce((sum, order) => sum + order.finalAmount, 0),
            totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0)
        };

        // Add summary section
        worksheet.addRow([]);
        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Orders:', summary.totalOrders]);
        worksheet.addRow(['Total Sales:', `₹${summary.totalSales.toLocaleString()}`]);
        worksheet.addRow(['Total Discount:', `₹${summary.totalDiscount.toLocaleString()}`]);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Excel report error:', error);
        res.status(500).send('Error generating Excel report');
    }
};

const downloadPdfReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = {
            status: 'Delivered',
            createOn: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderedItems.product', 'productName')
            .sort({ createOn: -1 })
            .lean();

        if (!orders || orders.length === 0) {
            return res.status(404).send('No orders found for the specified date range');
        }

        // Create PDF document with wider margins for better layout
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
        
        doc.pipe(res);

        // Improved header styling
        doc.font('Helvetica-Bold')
           .fontSize(24)
           .text('Sales Report', { align: 'center' });
        
        doc.moveDown()
           .fontSize(14)
           .text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });

        // Calculate summary
        const summary = {
            totalOrders: orders.length,
            totalSales: orders.reduce((sum, order) => sum + order.finalAmount, 0),
            totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0)
        };

        // Improved summary section with better spacing
        doc.moveDown(2);
        const summaryBox = {
            x: 70,
            y: doc.y,
            width: 460,
            height: 120
        };

        // Draw summary box with rounded corners
        doc.roundedRect(summaryBox.x, summaryBox.y, summaryBox.width, summaryBox.height, 5)
           .stroke();

        // Add summary content with better spacing and proper currency symbol
        doc.fontSize(16)
           .text('Summary', summaryBox.x + 30, summaryBox.y + 20);
        
        doc.fontSize(12)
           .text(`Total Orders: ${summary.totalOrders}`, summaryBox.x + 30, summaryBox.y + 50)
           .text(`Total Sales: Rs. ${summary.totalSales.toLocaleString()}`, summaryBox.x + 30, summaryBox.y + 75)
           .text(`Total Discount: Rs. ${summary.totalDiscount.toLocaleString()}`, summaryBox.x + 30, summaryBox.y + 100);

        // Improved table configuration
        const tableTop = summaryBox.y + summaryBox.height + 40;
        const tableWidth = 460;
        const startX = 70;
        
        const colWidths = [
            Math.floor(tableWidth * 0.25), // Order ID (25%)
            Math.floor(tableWidth * 0.15), // Date (15%)
            Math.floor(tableWidth * 0.20), // Customer (20%)
            Math.floor(tableWidth * 0.10), // Items (10%)
            Math.floor(tableWidth * 0.15), // Amount (15%)
            Math.floor(tableWidth * 0.15)  // Discount (15%)
        ];
        
        // Updated headers without the superscript
        const headers = ['Order ID', 'Date', 'Customer', 'Items', 'Amount (Rs.)', 'Discount (Rs.)'];
        const rowHeight = 30;

        // Draw table header with improved styling
        let yPos = tableTop;
        
        // Header background
        doc.fillColor('#f3f4f6')
           .rect(startX, yPos, tableWidth, rowHeight)
           .fill()
           .fillColor('#000000');

        // Header text
        let xPos = startX;
        doc.font('Helvetica-Bold')
           .fontSize(10);

        headers.forEach((header, i) => {
            doc.text(
                header,
                xPos + 5,
                yPos + (rowHeight - 10) / 2,
                {
                    width: colWidths[i] - 10,
                    align: i >= 3 ? 'right' : 'left'
                }
            );
            xPos += colWidths[i];
        });

        // Draw table rows with improved spacing
        yPos += rowHeight;
        doc.font('Helvetica')
           .fontSize(9);

        orders.forEach((order) => {
            // Add new page if needed
            if (yPos > 750) {
                doc.addPage();
                yPos = 50;
                
                // Repeat header on new page
                doc.fillColor('#f3f4f6')
                   .rect(startX, yPos, tableWidth, rowHeight)
                   .fill()
                   .fillColor('#000000')
                   .font('Helvetica-Bold')
                   .fontSize(10);

                xPos = startX;
                headers.forEach((header, i) => {
                    doc.text(
                        header,
                        xPos + 5,
                        yPos + (rowHeight - 10) / 2,
                        {
                            width: colWidths[i] - 10,
                            align: i >= 3 ? 'right' : 'left'
                        }
                    );
                    xPos += colWidths[i];
                });

                doc.font('Helvetica')
                   .fontSize(9);
                yPos += rowHeight;
            }

            // Draw row with alternating background
            if ((yPos - tableTop) / rowHeight % 2 === 1) {
                doc.fillColor('#f9fafb')
                   .rect(startX, yPos, tableWidth, rowHeight)
                   .fill()
                   .fillColor('#000000');
            }

            // Draw row data
            xPos = startX;
            const rowData = [
                order.orderId,
                new Date(order.createOn).toLocaleDateString(),
                order.userId?.name || 'N/A',
                order.orderedItems.length.toString(),
                order.finalAmount.toLocaleString(),
                order.discount.toLocaleString()
            ];

            rowData.forEach((cell, i) => {
                // Add 'Rs. ' prefix for amount and discount columns
                const displayValue = i >= 4 ? `Rs. ${cell}` : cell;
                doc.text(
                    displayValue,
                    xPos + 5,
                    yPos + (rowHeight - 9) / 2,
                    {
                        width: colWidths[i] - 10,
                        align: i >= 3 ? 'right' : 'left'
                    }
                );
                xPos += colWidths[i];
            });

            // Draw row border
            doc.rect(startX, yPos, tableWidth, rowHeight)
               .stroke();

            yPos += rowHeight;
        });

        doc.end();

    } catch (error) {
        console.error('PDF report error:', error);
        res.status(500).send('Error generating PDF report');
    }
};




















 const pageerror = async (req,res)=>{
    res.render("admin-error")
 }

 //logout
 const logout = async(req,res)=>{
     try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroyed session",err);
                return res.redirect('/pageerror')
                
            }
          res.redirect('/admin/login')
        })
     } catch (error) {
         console.log("unexpected error during logout",error);
         res.redirect("/pageerror")
     }
 }


module.exports = {
    loadlogin,
    login,
    loadDashboard,
    downloadExcelReport,
    downloadPdfReport,
    pageerror,
    logout
};
