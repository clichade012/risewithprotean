import { DataTypes } from 'sequelize';

const CstCustomerModel = (sequelize) => {
    const CstCustomer = sequelize.define('CstCustomer', {
        customer_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        company_name: {
            type: DataTypes.STRING(250),
            allowNull: true,
        },
        first_name: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        last_name: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        email_id: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        network_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        mobile_no: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        industry_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        segment_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        user_name: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        user_pass: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        register_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_approved: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        is_activated: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        activation_token_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        activation_token_time: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        activated_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        approved_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        reset_pass_token_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        reset_pass_token_time: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        approval_response: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        developer_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        live_environment: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        account_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_live_sandbox: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        billing_type: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        wallets_amount: {
            type: DataTypes.DECIMAL(18, 2),
            defaultValue: 0,
        },
        wallets_amt_updated_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        total_credits: {
            type: DataTypes.DECIMAL(18, 2),
            defaultValue: 0,
        },
        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_for_sandbox: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_from_admin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        sandbox_added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        billing_type_modified_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        activated_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        tableName: 'cst_customer',
        timestamps: false,
    });

    return CstCustomer;
};

export default CstCustomerModel;
