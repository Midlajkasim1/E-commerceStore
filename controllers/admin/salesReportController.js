const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const fs = require('fs');

const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, reportType } = req.query;
        let query = {};
        let dateRange = {};

        // Set date range based on report type
        if (reportType === 'daily') {
            const today = new Date();
            dateRange = {
                start: new Date(today.setHours(0, 0, 0, 0)),
                end: new Date(today.setHours(23, 59, 59, 999))
            };
        } else if (reportType === 'weekly') {
            const today = new Date();
            const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
            dateRange = {
                start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
                end: new Date()
            };
        } else if (reportType === 'monthly') {
            const today = new Date();
            dateRange = {
                start: new Date(today.getFullYear(), today.getMonth(), 1),
                end: new Date()
            };
        } else if (reportType === 'yearly') {
            const today = new Date();
            dateRange = {
                start: new Date(today.getFullYear(), 0, 1),
                end: new Date()
            };
        } else if (reportType === 'custom' && startDate && endDate) {
            dateRange = {
                start: new Date(startDate),
                end: new Date(endDate)
            };
        }

        // Build query with date range
        if (dateRange.start && dateRange.end) {
            query.createOn = {
                $gte: dateRange.start,
                $lte: dateRange.end
            };
        }

        // Add status condition for completed orders
        query.status = { $in: ['Delivered'] };

        // Fetch orders with populated data
        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderedItems.product', 'productName regularPrice salePrice')
            .sort({ createOn: -1 });

        // Calculate summary statistics
        const summary = {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, order) => sum + order.finalAmount, 0),
            totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0),
            averageOrderValue: orders.length > 0 ? 
                orders.reduce((sum, order) => sum + order.finalAmount, 0) / orders.length : 0
        };

        // Render sales report page
        res.render('admin-sales-report', {
            orders,
            summary,
            reportType,
            startDate: dateRange.start,
            endDate: dateRange.end
        });

    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).send('Error generating sales report');
    }
};
// const downloadExcelReport = async (req, res) => {
//     try {
//         let { startDate, endDate } = req.query;
        
//         // Ensure valid dates
//         startDate = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//         endDate = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

//         // Validate dates
//         if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
//             throw new Error('Invalid date range');
//         }
        
//         // Fetch orders within date range
//         const orders = await Order.find({
//             createOn: { 
//                 $gte: startDate, 
//                 $lte: endDate 
//             },
//             status: 'Delivered'
//         }).populate('userId orderedItems.product');

//         // Create new Excel workbook
//         const workbook = new ExcelJS.Workbook();
//         const worksheet = workbook.addWorksheet('Sales Report');

//         // Add headers
//         worksheet.columns = [
//             { header: 'Order ID', key: 'orderId', width: 25 },
//             { header: 'Date', key: 'date', width: 15 },
//             { header: 'Customer', key: 'customer', width: 20 },
//             { header: 'Products', key: 'products', width: 30 },
//             { header: 'Total Amount', key: 'total', width: 15 },
//             { header: 'Discount', key: 'discount', width: 15 },
//             { header: 'Final Amount', key: 'final', width: 15 }
//         ];

//         // Add data rows
//         orders.forEach(order => {
//             worksheet.addRow({
//                 orderId: order.orderId,
//                 date: order.createOn.toLocaleDateString(),
//                 customer: order.userId?.name || 'N/A',
//                 products: order.orderedItems.map(item => 
//                     `${item.product?.productName || 'N/A'} (${item.quantity})`
//                 ).join(', '),
//                 total: order.totalPrice,
//                 discount: order.discount,
//                 final: order.finalAmount
//             });
//         });

//         // Set response headers
//         res.setHeader(
//             'Content-Type',
//             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//         );
//         res.setHeader(
//             'Content-Disposition',
//             'attachment; filename=sales-report.xlsx'
//         );

//         // Write to response
//         await workbook.xlsx.write(res);
//         res.end();

//     } catch (error) {
//         console.error('Error downloading Excel report:', error);
//         res.status(500).send('Error generating Excel report');
//     }
// };

// const downloadPdfReport = async (req, res) => {
//     try {
//         let { startDate, endDate } = req.query;
        
//         // Ensure valid dates
//         startDate = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
//         endDate = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

//         // Validate dates
//         if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
//             throw new Error('Invalid date range');
//         }
        
//         // Fetch orders within date range
//         const orders = await Order.find({
//             createOn: { 
//                 $gte: startDate, 
//                 $lte: endDate 
//             },
//             status: 'Delivered'
//         }).populate('userId orderedItems.product');

//         // Create PDF document
//         const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
//         // Set response headers
//         res.setHeader('Content-Type', 'application/pdf');
//         res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
        
//         // Pipe to response
//         doc.pipe(res);

//         // Add title
//         doc.fontSize(20).text('Sales Report', { align: 'center' });
//         doc.moveDown();

//         // Add date range
//         doc.fontSize(12).text(
//             `Period: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
//             { align: 'center' }
//         );
//         doc.moveDown();

//         // Create table data
//         const tableData = {
//             headers: ['Order ID', 'Date', 'Customer', 'Total', 'Discount', 'Final'],
//             rows: orders.map(order => [
//                 order.orderId,
//                 order.createOn.toLocaleDateString(),
//                 order.userId?.name || 'N/A',
//                 order.totalPrice.toFixed(2),
//                 order.discount.toFixed(2),
//                 order.finalAmount.toFixed(2)
//             ])
//         };

//         // Add table to document
//         await doc.table(tableData, {
//             prepareHeader: () => doc.fontSize(10),
//             prepareRow: () => doc.fontSize(10)
//         });

//         // Add summary
//         doc.moveDown();
//         const summary = {
//             totalOrders: orders.length,
//             totalRevenue: orders.reduce((sum, order) => sum + order.finalAmount, 0),
//             totalDiscount: orders.reduce((sum, order) => sum + order.discount, 0)
//         };

//         doc.fontSize(12).text('Summary', { underline: true });
//         doc.fontSize(10).text(`Total Orders: ${summary.totalOrders}`);
//         doc.fontSize(10).text(`Total Revenue: ₹${summary.totalRevenue.toFixed(2)}`);
//         doc.fontSize(10).text(`Total Discounts: ₹${summary.totalDiscount.toFixed(2)}`);

//         // Finalize PDF
//         doc.end();

//     } catch (error) {
//         console.error('Error downloading PDF report:', error);
//         res.status(500).send('Error generating PDF report');
//     }
// };

module.exports = {
    getSalesReport,
    // downloadExcelReport,
    // downloadPdfReport
};