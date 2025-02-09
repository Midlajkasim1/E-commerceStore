const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const bcrypt = require('bcrypt')
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');
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
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(new Date(startOfMonth).setMonth(startOfMonth.getMonth() - 1));

        const currentPeriodSales = await Order.aggregate([
            { 
                $match: { 
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

        const previousPeriodSales = await Order.aggregate([
            { 
                $match: { 
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


        const monthlyOrders = await Order.aggregate([
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

        const totalStats = await Order.aggregate([
            { 
                $group: { 
                    _id: null, 
                    totalSales: { $sum: '$finalAmount' },
                    totalOrders: { $sum: 1 },
                    totalDiscount: { $sum: '$discount' }
                }
            }
        ]);

        const orderStatusDistribution = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$finalAmount' }
                }
            }
        ]);

        const totalUsers = await User.countDocuments({ isBlocked: false });

        const userPurchaseHistory = await Order.aggregate([
            {
                $group: {
                    _id: '$userId',
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$finalAmount' },
                    lastPurchase: { $max: '$createOn' },
                    orderStatuses: { 
                        $push: {
                            status: '$status',
                            amount: '$finalAmount'
                        }
                    }
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
                    lastPurchase: 1,
                    orderStatuses: 1
                }
            },
            {
                $sort: { totalSpent: -1 }
            },
            {
                $limit: 10
            }
        ]);

        const currentSales = currentPeriodSales[0]?.total || 0;
        const previousSales = previousPeriodSales[0]?.total || 0;
        const salesGrowth = previousSales === 0 
            ? 100 
            : ((currentSales - previousSales) / previousSales) * 100;

          const statusSummary = {};
        orderStatusDistribution.forEach(status => {
            statusSummary[status._id] = {
                count: status.count,
                amount: status.totalAmount,
                percentage: ((status.count / totalStats[0].totalOrders) * 100).toFixed(1)
            };
        });
        // console.log("Current Period Sales:", currentPeriodSales);
        // console.log("Previous Period Sales:", previousPeriodSales);
        // console.log("Monthly Orders:", monthlyOrders);
        // console.log("Total Stats:", totalStats);
        // console.log("Order Status Distribution:", orderStatusDistribution);
       

        res.render('dashboard', {
            totalSales: totalStats[0]?.totalSales || 0,
            totalOrders: totalStats[0]?.totalOrders || 0,
            totalDiscounts: totalStats[0]?.totalDiscount || 0,
            totalUsers,
            salesGrowth: parseFloat(salesGrowth.toFixed(1)),
            userPurchaseHistory,
            orderStatusSummary: statusSummary,
            monthlyOrderCounts: monthlyOrders,
            message: req.flash()
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
};

const downloadExcelReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate || !Date.parse(startDate) || !Date.parse(endDate)) {
            req.flash('error', 'Please enter valid start and end dates');
            return res.redirect('/admin/dashboard');
        }
        
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        if (end < start) {
            req.flash('error', 'End date must be after start date');
            return res.redirect('/admin/dashboard');
        }

        const query = {
            createOn: { 
                $gte: start, 
                $lte: end 
            }
        };

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderedItems.product', 'productName price')
            .sort({ createOn: -1 })
            .lean();

        if (!orders || orders.length === 0) {
            req.flash('error', 'No orders found for the specified date range');
            return res.redirect('/admin/dashboard');
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 15 },
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Status', key: 'status', width: 15 },
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

        // Add status-based conditional formatting
        const statusStyles = {
            'Delivered': { fgColor: { argb: 'FFE2EFDA' } }, // Light green
            'Pending': { fgColor: { argb: 'FFFFF2CC' } },   // Light yellow
            'Processing': { fgColor: { argb: 'FFFCE4D6' } } // Light orange
        };

        orders.forEach(order => {
            const finalAmount = order.totalPrice - (order.discount || 0);
            const row = worksheet.addRow({
                orderId: order.orderId,
                date: new Date(order.createOn).toLocaleString(),
                customer: order.userId?.name || 'N/A',
                email: order.userId?.email || 'N/A',
                status: order.status,
                products: order.orderedItems
                    .map(item => `${item.product?.productName} (${item.quantity})`)
                    .join(', '),
                items: order.orderedItems.reduce((sum, item) => sum + item.quantity, 0),
                amount: order.totalPrice || 0,
                discount: order.discount || 0,
                finalAmount: finalAmount
            });

            // Apply status-based styling
            const statusStyle = statusStyles[order.status];
            if (statusStyle) {
                const statusCell = row.getCell('status');
                statusCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    ...statusStyle
                };
            }
        });

        ['amount', 'discount', 'finalAmount'].forEach(column => {
            worksheet.getColumn(column).numFmt = '₹#,##0.00';
        });

        const summary = {
            totalOrders: orders.length,
            totalItems: orders.reduce((sum, order) => 
                sum + order.orderedItems.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
            totalAmount: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
            totalDiscount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
            totalFinal: orders.reduce((sum, order) => sum + (order.totalPrice - (order.discount || 0)), 0),
            statusCounts: orders.reduce((acc, order) => {
                acc[order.status] = (acc[order.status] || 0) + 1;
                return acc;
            }, {})
        };

        worksheet.addRow([]);
        worksheet.addRow(['Summary']);
        const summaryRow = worksheet.lastRow;
        summaryRow.font = { bold: true, size: 12 };
        
        worksheet.addRow(['Total Orders:', summary.totalOrders]);
        worksheet.addRow(['Total Items:', summary.totalItems]);
        worksheet.addRow(['Total Amount:', summary.totalAmount]).getCell(2).numFmt = '₹#,##0.00';
        worksheet.addRow(['Total Discount:', summary.totalDiscount]).getCell(2).numFmt = '₹#,##0.00';
        worksheet.addRow(['Final Total:', summary.totalFinal]).getCell(2).numFmt = '₹#,##0.00';
        
        // Add status distribution
        worksheet.addRow([]);
        worksheet.addRow(['Order Status Distribution']);
        for (const [status, count] of Object.entries(summary.statusCounts)) {
            worksheet.addRow([status, count, `${((count/orders.length)*100).toFixed(1)}%`]);
        }

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
        if (!startDate || !endDate || !Date.parse(startDate) || !Date.parse(endDate)) {
            req.flash('error', 'Please enter valid start and end dates');
            return res.redirect('/admin/dashboard');
        }

        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        if (end < start) {
            req.flash('error', 'End date must be after start date');
            return res.redirect('/admin/dashboard');
        }

        const query = {
            createOn: {
                $gte: start,
                $lte: end
            }
        };

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderedItems.product', 'productName price')
            .sort({ createOn: -1 })
            .lean();

        if (!orders || orders.length === 0) {
            req.flash('error', 'No orders found for the specified date range');
            return res.redirect('/admin/dashboard');
        }

        const fonts = {
            Helvetica: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        };

        const printer = new PdfPrinter(fonts);
        
        const formatNumber = (amount) => {
            if (typeof amount !== 'number') return '0.00';
            return new Intl.NumberFormat('en-IN', {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
                useGrouping: true,
                style: 'decimal'
            }).format(amount);
        };

       
        const summary = {
            totalOrders: orders.length,
            totalItems: orders.reduce((sum, order) => 
                sum + order.orderedItems.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
            totalAmount: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
            totalDiscount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
            totalFinal: orders.reduce((sum, order) => sum + (order.totalPrice - (order.discount || 0)), 0)
        };
        const summaryData = [
            { text: 'Total Orders', value: summary.totalOrders },
            { text: 'Total Items', value: summary.totalItems },
            { text: 'Total Amount', value: formatNumber(summary.totalAmount) },
            { text: 'Total Discount', value: formatNumber(summary.totalDiscount) },
            { text: 'Final Amount', value: formatNumber(summary.totalFinal) }
        ];

        const statusCounts = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {});

        // Format the status distribution text
        const statusDistribution = Object.entries(statusCounts)
            .map(([status, count]) => `${status}: ${count} orders (${((count / orders.length) * 100).toFixed(1)}%)`)
            .join('\n');

        const getStatusColor = (status) => {
            const colors = {
                'Delivered': '#4ade80',
                'Pending': '#facc15',
                'Processing': '#60a5fa',
                'Cancelled': '#ef4444'
            };
            return colors[status] || '#6b7280';
        };

        const tableBody = orders.map(order => {
            const finalAmount = order.totalPrice - (order.discount || 0);
            return [
                { 
                    text: order.orderId, 
                    style: 'tableCell',
                    width: 60  // Fixed width for Order ID
                },
                { 
                    text: new Date(order.createOn).toLocaleDateString(), // Changed to date only for space
                    style: 'tableCell',
                    width: 70
                },
                { 
                    text: order.userId?.name || 'N/A', 
                    style: 'tableCell',
                    width: '*'  // Customer name takes remaining space
                },
                { 
                    text: order.status,
                    style: 'tableCell',
                    color: getStatusColor(order.status),
                    width: 60
                },
                { 
                    text: order.orderedItems.reduce((sum, item) => sum + item.quantity, 0).toString(), 
                    style: 'tableCell', 
                    alignment: 'right',
                    width: 40
                },
                { 
                    text: formatNumber(order.totalPrice || 0), 
                    style: 'tableCellAmount', 
                    alignment: 'right',
                    width: 90  // Increased width for amounts
                },
                { 
                    text: formatNumber(order.discount || 0), 
                    style: 'tableCellAmount', 
                    alignment: 'right',
                    width: 90  // Increased width for amounts
                },
                { 
                    text: formatNumber(finalAmount), 
                    style: 'tableCellAmount', 
                    alignment: 'right',
                    width: 90  // Increased width for amounts
                }
            ];
        });

        const docDefinition = {
            pageSize: 'A4',
            pageOrientation: 'landscape',  // Changed to landscape for more width
            pageMargins: [20, 40, 20, 40], // Reduced margins
            
            content: [
                {
                    text: 'Sales Report',
                    style: 'header',
                    margin: [0, 0, 0, 10]
                },
                {
                    text: `Period: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
                    style: 'subheader',
                    margin: [0, 0, 0, 20]
                },
                {
                    style: 'summaryBox',
                    margin: [0, 0, 0, 20],
                    table: {
                        widths: ['*', 100],  // Adjusted summary table widths
                        body: [
                            [{ text: 'Summary', style: 'summaryTitle', colSpan: 2 }, {}],
                            ...summaryData.map(item => [
                                { text: item.text, style: 'summaryLabel' },
                                { 
                                    text: typeof item.value === 'number' ? 
                                        item.value.toString() : 
                                        item.value, 
                                    style: 'summaryValue', 
                                    alignment: 'right' 
                                }
                            ]),
                            [{ text: '\nOrder Status Distribution:', style: 'distributionTitle', colSpan: 2 }, {}],
                            [{ text: statusDistribution, style: 'distributionText', colSpan: 2 }, {}]
                        ]
                    },
                    layout: 'noBorders'
                },
                {
                    margin: [0, 20],
                    table: {
                        headerRows: 1,
                        widths: [60, 70, '*', 60, 40, 90, 90, 90],  // Adjusted column widths
                        body: [
                            [
                                { text: 'Order ID', style: 'tableHeader' },
                                { text: 'Date', style: 'tableHeader' },
                                { text: 'Customer', style: 'tableHeader' },
                                { text: 'Status', style: 'tableHeader' },
                                { text: 'Items', style: 'tableHeader', alignment: 'right' },
                                { text: 'Amount', style: 'tableHeader', alignment: 'right' },
                                { text: 'Discount', style: 'tableHeader', alignment: 'right' },
                                { text: 'Final', style: 'tableHeader', alignment: 'right' }
                            ],
                            ...tableBody
                        ]
                    },
                    layout: {
                        hLineWidth: (i, node) => 1,
                        vLineWidth: () => 1,
                        hLineColor: () => '#E5E7EB',
                        vLineColor: () => '#E5E7EB',
                        paddingLeft: (i, node) => 5,  // Reduced padding
                        paddingRight: (i, node) => 5, // Reduced padding
                        paddingTop: (i, node) => 5,   // Reduced padding
                        paddingBottom: (i, node) => 5,// Reduced padding
                        fillColor: (rowIndex) => {
                            if (rowIndex === 0) return '#4B5563';
                            return rowIndex % 2 === 0 ? '#F9FAFB' : null;
                        }
                    }
                }
            ],

            styles: {
                header: {
                    fontSize: 18,
                    bold: true,
                    alignment: 'center'
                },
                subheader: {
                    fontSize: 12,
                    alignment: 'center',
                    color: '#666666'
                },
                summaryTitle: {
                    fontSize: 14,
                    bold: true,
                    margin: [0, 0, 0, 10]
                },
                summaryLabel: {
                    fontSize: 11,
                    color: '#666666'
                },
                summaryValue: {
                    fontSize: 11,
                    alignment: 'right'
                },
                distributionTitle: {
                    fontSize: 11,
                    bold: true,
                    margin: [0, 10, 0, 5]
                },
                distributionText: {
                    fontSize: 10,
                    color: '#666666'
                },
                tableHeader: {
                    fontSize: 10,
                    bold: true,
                    color: 'white',
                    margin: [2, 2, 2, 2]  // Reduced margins
                },
                tableCell: {
                    fontSize: 9,
                    margin: [2, 2, 2, 2]  // Reduced margins
                },
                tableCellAmount: {
                    fontSize: 9,
                    margin: [2, 2, 2, 2],  // Reduced margins
                    alignment: 'right'
                }
            },
            
            defaultStyle: {
                font: 'Helvetica'
            }
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
        pdfDoc.pipe(res);
        pdfDoc.end();

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
