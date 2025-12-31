import { DataTypes } from 'sequelize';

const PageLabelInfoModel = (sequelize) => {
    const PageLabelInfo = sequelize.define('PageLabelInfo', {
        label_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
        },
        pages_name: {
            type: DataTypes.STRING(4000),
            allowNull: true,
        },
        label_name: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        info_text: {
            type: DataTypes.STRING(4000),
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        tableName: 'page_label_info',
        timestamps: false,
    });

    return PageLabelInfo;
};

export default PageLabelInfoModel;
