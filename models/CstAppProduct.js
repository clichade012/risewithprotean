import { DataTypes } from 'sequelize';

const CstAppProductModel = (sequelize) => {
    const CstAppProduct = sequelize.define('CstAppProduct', {
        app_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
        },
    }, {
        tableName: 'cst_app_product',
        timestamps: false,
    });

    return CstAppProduct;
};

export default CstAppProductModel;
