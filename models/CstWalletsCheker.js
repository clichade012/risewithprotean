import { DataTypes } from 'sequelize';

const CstWalletsCheckerModel = (sequelize) => {
    const CstWalletsChecker = sequelize.define('CstWalletsChecker', {
        cust_wallet_id: {
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
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        transaction_type: {
            type: DataTypes.INTEGER,
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
        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_wallet_amount_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_wallet_amount_approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        ckr_wallet_amount_approved_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        ckr_wallet_amount_approved_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        ckr_wallet_amount_is_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_wallet_amount_is_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_wallet_amount_rejected_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        ckr_wallet_amount_rejected_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        ckr_wallet_amount_rejected_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_wallet_amount_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'cst_wallets_cheker',
        timestamps: false,
    });

    return CstWalletsChecker;
};

export default CstWalletsCheckerModel;
