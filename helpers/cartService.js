const Cart = require('../models/cartSchema');
 

const syncCarts = async (userId, sessionCart) => {
    try {
        let dbCart = await Cart.findOne({ userId });
        
        if (!dbCart) {
            dbCart = new Cart({
                userId,
                items: []
            });
        }

        dbCart.items = sessionCart.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.salePrice,
            totalPrice: item.salePrice * item.quantity,
            status: 'placed'
        }));

        await dbCart.save();
        return dbCart;
    } catch (error) {
        console.error('Cart sync error:', error);
        throw error;
    }
};


module.exports = {
    syncCarts
}