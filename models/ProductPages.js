import { DataTypes } from 'sequelize';

const ProductPagesModel = (sequelize) => {
    const ProductPages = sequelize.define('ProductPages', {
        page_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        menu_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        show_api_method: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        is_published: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        sort_order: {
            type: DataTypes.INTEGER,
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
        tableName: 'product_pages',
        timestamps: false,
    });

    return ProductPages;
};

export default ProductPagesModel;
