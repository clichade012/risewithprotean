import { DataTypes } from 'sequelize';

const CstCreditsModel = (sequelize) => {
    const CstCredits = sequelize.define('CstCredits', {
        credit_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        credits: {
            type: DataTypes.DECIMAL(18, 2),
            allowNull: true,
        },
        transaction_type: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'cst_credits',
        timestamps: false,
    });

    return CstCredits;
};

export default CstCreditsModel;
