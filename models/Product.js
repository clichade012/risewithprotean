import { DataTypes } from 'sequelize';

const ProductModel = (sequelize) => {
    const Product = sequelize.define('Product', {
        product_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        product_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        display_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        key_features: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        product_icon: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        product_open_spec: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        product_open_spec_json: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        api_doc_version: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        is_published: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_product_published: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        monitization_rate_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'product',
        timestamps: false,
    });

    return Product;
};

export default ProductModel;
