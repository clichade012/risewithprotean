import { DataTypes } from 'sequelize';

const ProxiesModel = (sequelize) => {
    const Proxies = sequelize.define('Proxies', {
        proxy_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        proxy_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        display_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
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
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'proxies',
        timestamps: false,
    });

    return Proxies;
};

export default ProxiesModel;
