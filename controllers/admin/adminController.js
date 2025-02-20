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

// adminController.js
const loadDashboard = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let start = new Date();
        let end = new Date();

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({ error: 'Invalid date format' });
            }

            if (start > end) {
                return res.status(400).json({ error: 'Start date cannot be later than end date' });
            }

            if (end > new Date()) {
                return res.status(400).json({ error: 'End date cannot be in the future' });
            }

            const oneYear = 365 * 24 * 60 * 60 * 1000;
            if (end - start > oneYear) {
                return res.status(400).json({ error: 'Date range cannot exceed one year' });
            }
        } else {
            start.setMonth(start.getMonth() - 1);
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        
       const dateMatch = {
            createOn: {
                $gte: start,
                $lte: end
            },
            $or: [
                { status: { $nin: ['failed', 'Cancelled'] } },
                { 
                    status: 'Delivered',
                    paymentMethod: 'COD'
                }
            ]
        };

        const [currentPeriodData, orderStatusData, bestSellingProducts, bestSellingCategories] = await Promise.all([
            Order.aggregate([
                { $match: dateMatch },
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: '$finalAmount' },
                        totalOrders: { $sum: 1 },
                        totalDiscounts: { $sum: '$discount' }
                    }
                }
            ]),

            Order.aggregate([
                { $match: dateMatch },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        amount: { $sum: '$finalAmount' }
                    }
                }
            ]),

            Order.aggregate([
                { 
                    $match: dateMatch
                },
                { $unwind: '$orderedItems' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderedItems.product',
                        foreignField: '_id',
                        as: 'productDetails'
                    }
                },
                { 
                    $match: {
                        'productDetails': { $ne: [] }
                    }
                },
                { $unwind: '$productDetails' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'productDetails.category',
                        foreignField: '_id',
                        as: 'categoryDetails'
                    }
                },
                {
                    $unwind: '$categoryDetails'
                },
                {
                    $group: {
                        _id: '$orderedItems.product',
                        name: { $first: '$productDetails.productName' },
                        category: { $first: '$categoryDetails.name' },
                        totalQuantity: { $sum: '$orderedItems.quantity' },
                        totalRevenue: { 
                            $sum: { 
                                $multiply: ['$orderedItems.price', '$orderedItems.quantity'] 
                            }
                        },
                        orderCount: { $sum: 1 }
                    }
                },
                { 
                    $match: { 
                        name: { $exists: true },
                        category: { $exists: true }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 10 }
            ]),

            Order.aggregate([
                { 
                    $match: dateMatch
                },
                { $unwind: '$orderedItems' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'orderedItems.product',
                        foreignField: '_id',
                        as: 'productDetails'
                    }
                },
                { 
                    $match: {
                        'productDetails': { $ne: [] }
                    }
                },
                { $unwind: '$productDetails' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'productDetails.category',
                        foreignField: '_id',
                        as: 'categoryDetails'
                    }
                },
                {
                    $unwind: '$categoryDetails'
                },
                {
                    $group: {
                        _id: '$categoryDetails.name',
                        totalQuantity: { $sum: '$orderedItems.quantity' },
                        totalRevenue: { 
                            $sum: { 
                                $multiply: ['$orderedItems.price', '$orderedItems.quantity'] 
                            }
                        },
                        orderCount: { $sum: 1 }
                    }
                },
                { 
                    $match: { 
                        _id: { $exists: true, $ne: null }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 10 }
            ])
        ]);

        const defaultStats = {
            totalSales: 0,
            totalOrders: 0,
            totalDiscounts: 0
        };

        const statistics = currentPeriodData[0] || defaultStats;

        const orderStatusSummary = {};
        orderStatusData.forEach(status => {
            orderStatusSummary[status._id] = {
                count: status.count,
                amount: status.amount,
                percentage: ((status.count / (statistics.totalOrders || 1)) * 100).toFixed(1)
            };
        });

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                statistics,
                orderStatusSummary,
                bestSellingProducts,
                bestSellingCategories,
                dateRange: {
                    start: start.toISOString(),
                    end: end.toISOString()
                }
            });
        }

        res.render('dashboard', {
            totalSales: statistics.totalSales || 0,
            totalOrders: statistics.totalOrders || 0,
            totalDiscounts: statistics.totalDiscounts || 0,
            totalUsers: await User.countDocuments({ isBlocked: false }),
            salesGrowth: 0,
            bestSellingProducts,
            bestSellingCategories,
            orderStatusSummary,
            selectedDateRange: {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            },
            message: req.flash()
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ 
                error: 'Error loading dashboard data',
                details: error.message 
            });
        }
        req.flash('error', error.message || 'Error loading dashboard data');
        res.redirect('/admin/dashboard');
    }
};
const getChartData = async (req, res) => {
    try {
        const { filter = 'monthly', startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        if (start > end) {
            return res.status(400).json({ error: 'Start date cannot be later than end date' });
        }

        if (end > today) {
            return res.status(400).json({ error: 'End date cannot be in the future' });
        }

        const oneYear = 365 * 24 * 60 * 60 * 1000;
        if (end - start > oneYear) {
            return res.status(400).json({ error: 'Date range cannot exceed one year' });
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        let groupStage;
        let projectStage;

        const matchStage = {
            $match: {
                createOn: { $gte: start, $lte: end },
                status: { $nin: ['Failed', 'Cancelled'] } 
            }
        };

        switch (filter) {
            case 'yearly':
                groupStage = {
                    $group: {
                        _id: { $year: '$createOn' },
                        sales: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        statusCounts: {
                            $push: {
                                $cond: {
                                    if: { $in: ['$status', ['Delivered', 'Processing', 'Pending']] },
                                    then: '$status',
                                    else: null
                                }
                            }
                        }
                    }
                };
                break;

            case 'monthly':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: '$createOn' },
                            month: { $month: '$createOn' }
                        },
                        sales: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        statusCounts: {
                            $push: {
                                $cond: {
                                    if: { $in: ['$status', ['Delivered', 'Processing', 'Pending']] },
                                    then: '$status',
                                    else: null
                                }
                            }
                        }
                    }
                };
                projectStage = {
                    $project: {
                        _id: 1,
                        sales: 1,
                        orders: 1,
                        statusCounts: {
                            $reduce: {
                                input: '$statusCounts',
                                initialValue: { Delivered: 0, Processing: 0, Pending: 0 },
                                in: {
                                    $mergeObjects: [
                                        '$$value',
                                        {
                                            $switch: {
                                                branches: [
                                                    { case: { $eq: ['$$this', 'Delivered'] }, then: { Delivered: 1 } },
                                                    { case: { $eq: ['$$this', 'Processing'] }, then: { Processing: 1 } },
                                                    { case: { $eq: ['$$this', 'Pending'] }, then: { Pending: 1 } }
                                                ],
                                                default: {}
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                };
                break;

            case 'weekly':
                groupStage = {
                    $group: {
                        _id: {
                            year: { $year: '$createOn' },
                            week: { $week: '$createOn' }
                        },
                        sales: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        statusCounts: {
                            $push: {
                                $cond: {
                                    if: { $in: ['$status', ['Delivered', 'Processing', 'Pending']] },
                                    then: '$status',
                                    else: null
                                }
                            }
                        }
                    }
                };
                break;

            case 'daily':
                groupStage = {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createOn' }
                        },
                        sales: { $sum: '$finalAmount' },
                        orders: { $sum: 1 },
                        statusCounts: {
                            $push: {
                                $cond: {
                                    if: { $in: ['$status', ['Delivered', 'Processing', 'Pending']] },
                                    then: '$status',
                                    else: null
                                }
                            }
                        }
                    }
                };
                break;

            default:
                return res.status(400).json({ error: 'Invalid filter type' });
        }

        const pipeline = [
            matchStage,
            groupStage
        ];

        if (projectStage) {
            pipeline.push(projectStage);
        }

        pipeline.push({ $sort: { '_id': 1 } });

        const chartData = await Order.aggregate(pipeline);

        if (filter !== 'monthly') {
            chartData.forEach(data => {
                const validStatuses = data.statusCounts.filter(status => status !== null);
                const counts = validStatuses.reduce((acc, status) => {
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                }, { Delivered: 0, Processing: 0, Pending: 0 }); 
                data.statusCounts = counts;
            });
        }

        res.json(chartData);

    } catch (error) {
        console.error('Chart data error:', error);
        res.status(500).json({ 
            error: 'Error fetching chart data',
            details: error.message 
        });
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
            },
            status: 'Delivered' 
        };

        const orders = await Order.find(query)
            .sort({ createOn: -1 })
            .lean();

        if (!orders || orders.length === 0) {
            req.flash('error', 'No completed sales found for the specified date range');
            return res.redirect('/admin/dashboard');
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 15, style: { alignment: { horizontal: 'center' } } },
            { header: 'Date', key: 'date', width: 15, style: { alignment: { horizontal: 'center' } } },
            { header: 'Items', key: 'items', width: 10, style: { alignment: { horizontal: 'center' } } },
            { header: 'Base Amount', key: 'baseAmount', width: 15, style: { alignment: { horizontal: 'center' } } },
            { header: 'Discount', key: 'discount', width: 15, style: { alignment: { horizontal: 'center' } } },
            { header: 'Final Amount', key: 'finalAmount', width: 15, style: { alignment: { horizontal: 'center' } } },
            { header: 'Payment Method', key: 'paymentMethod', width: 15, style: { alignment: { horizontal: 'center' } } }
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF8DB4E2' }
        };

        orders.forEach(order => {
            const totalItems = order.orderedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const baseAmount = order.totalPrice || 0;
            const discount = order.discount || 0;
            const finalAmount = baseAmount - discount;

            worksheet.addRow({
                orderId: order.orderId,
                date: new Date(order.createOn).toLocaleDateString(),
                items: totalItems,
                baseAmount: baseAmount,
                discount: discount,
                finalAmount: finalAmount,
                paymentMethod: order.paymentMethod || 'N/A'
            });
        });

        ['baseAmount', 'discount', 'finalAmount'].forEach(column => {
            worksheet.getColumn(column).numFmt = '₹#,##0.00';
        });

        const summary = {
            totalOrders: orders.length,
            totalItems: orders.reduce((sum, order) => 
                sum + order.orderedItems.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0),
            totalBaseAmount: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
            totalDiscount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
            totalFinalAmount: orders.reduce((sum, order) => 
                sum + ((order.totalPrice || 0) - (order.discount || 0)), 0)
        };

        worksheet.addRow([]);
        worksheet.addRow(['Summary']);
        worksheet.addRow(['Total Orders', summary.totalOrders]);
        worksheet.addRow(['Total Items', summary.totalItems]);
        worksheet.addRow(['Total Base Amount', summary.totalBaseAmount]);
        worksheet.addRow(['Total Discount', summary.totalDiscount]);
        worksheet.addRow(['Total Final Amount', summary.totalFinalAmount]);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Excel report error:', error);
        req.flash('error', 'Error generating Excel report');
        res.redirect('/admin/dashboard');
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
            },
            status: 'Delivered'
        };

        const orders = await Order.find(query)
            .sort({ createOn: -1 })
            .lean();

        if (!orders || orders.length === 0) {
            req.flash('error', 'No completed sales found for the specified date range');
            return res.redirect('/admin/dashboard');
        }

        const summary = {
            totalOrders: orders.length,
            totalItems: orders.reduce((sum, order) => 
                sum + order.orderedItems.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0),
            totalBaseAmount: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
            totalDiscount: orders.reduce((sum, order) => sum + (order.discount || 0), 0),
            totalFinalAmount: orders.reduce((sum, order) => 
                sum + ((order.totalPrice || 0) - (order.discount || 0)), 0)
        };

        const formatCurrency = (amount) => {
            const formattedAmount = (amount || 0).toFixed(2);
            return `₹${formattedAmount}`;
        };

        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 60, 40, 60],
            content: [
                {
                    text: 'Sales Report',
                    style: 'header'
                },
                {
                    text: `Period: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`,
                    alignment: 'center',
                    margin: [0, 10, 0, 20]
                },
                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                            [
                                'Order ID',
                                'Date',
                                'Items',
                                'Base Amount',
                                'Discount',
                                'Final Amount',
                                'Payment Method'
                            ],
                            ...orders.map(order => {
                                const totalItems = order.orderedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                const baseAmount = order.totalPrice || 0;
                                const discount = order.discount || 0;
                                const finalAmount = baseAmount - discount;

                                return [
                                    order.orderId,
                                    new Date(order.createOn).toLocaleDateString(),
                                    totalItems,
                                    formatCurrency(baseAmount),
                                    formatCurrency(discount),
                                    formatCurrency(finalAmount),
                                    order.paymentMethod || 'N/A'
                                ];
                            })
                        ]
                    },
                    layout: {
                        fillColor: function(rowIndex) {
                            return (rowIndex === 0) ? '#8DB4E2' : null;
                        },
                        hLineWidth: () => 1,
                        vLineWidth: () => 1
                    }
                },
                {
                    text: 'Summary',
                    style: 'subheader',
                    margin: [0, 20, 0, 10]
                },
                {
                    table: {
                        widths: ['*', 'auto'],
                        body: [
                            ['Total Orders', summary.totalOrders.toString()],
                            ['Total Items', summary.totalItems.toString()],
                            ['Total Base Amount', formatCurrency(summary.totalBaseAmount)],
                            ['Total Discount', formatCurrency(summary.totalDiscount)],
                            ['Total Final Amount', formatCurrency(summary.totalFinalAmount)]
                        ]
                    },
                    layout: 'lightHorizontalLines'
                }
            ],
            styles: {
                header: {
                    fontSize: 18,
                    bold: true,
                    alignment: 'center',
                    margin: [0, 0, 0, 10]
                },
                subheader: {
                    fontSize: 14,
                    bold: true,
                    margin: [0, 15, 0, 5]
                }
            },
            defaultStyle: {
                fontSize: 10
            }
        };

        const printer = new PdfPrinter({
            Roboto: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        });

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        
        const filename = `sales-report-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error('PDF report error:', error);
        req.flash('error', 'Error generating PDF report');
        res.redirect('/admin/dashboard');
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
    getChartData,
    downloadExcelReport,
    downloadPdfReport,
    pageerror,
    logout
};
