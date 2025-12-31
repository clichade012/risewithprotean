import { DataTypes } from 'sequelize';

const CstWalletsPaymentRespModel = (sequelize) => {
    const CstWalletsPaymentResp = sequelize.define('CstWalletsPaymentResp', {
        resp_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        order_id: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        response_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        response_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        response_payload: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        bank_ref_no: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        transactionid: {
            type: DataTypes.STRING(100),
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
        tableName: 'cst_wallets_payment_resp',
        timestamps: false,
    });

    return CstWalletsPaymentResp;
};

export default CstWalletsPaymentRespModel;
