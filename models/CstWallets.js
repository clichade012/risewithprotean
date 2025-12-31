import { DataTypes } from 'sequelize';

const CstWalletsModel = (sequelize) => {
    const CstWallets = sequelize.define('CstWallets', {
        wallet_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        amount: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
        },
        transaction_type: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        previous_amount: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'cst_wallets',
        timestamps: false,
    });

    return CstWallets;
};

export default CstWalletsModel;
