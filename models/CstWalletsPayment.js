import { DataTypes } from 'sequelize';

const CstWalletsPaymentModel = (sequelize) => {
    const CstWalletsPayment = sequelize.define('CstWalletsPayment', {
        payment_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        order_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        gateway_order_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        correlation_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        wallet_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        payment_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        total_amount: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
        },
        is_success: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        bank_ref_no: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        transactionid: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        response_received: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        response_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        response_data_body: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        response_data_signature: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        response_data_decoded: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        response_data_payload: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        resp_error_type: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        resp_error_code: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        resp_error_desc: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        tableName: 'cst_wallets_payment',
        timestamps: false,
    });

    return CstWalletsPayment;
};

export default CstWalletsPaymentModel;
