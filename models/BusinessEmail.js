import { DataTypes } from 'sequelize';

const BusinessEmailModel = (sequelize) => {
    const BusinessEmail = sequelize.define('BusinessEmail', {
        email_id: {
            type: DataTypes.STRING(100),
            primaryKey: true,
        },
        type_id: {
            type: DataTypes.INTEGER,
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
    }, {
        tableName: 'business_email',
        timestamps: false,
    });

    return BusinessEmail;
};

export default BusinessEmailModel;
