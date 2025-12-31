import { DataTypes } from 'sequelize';

const HomePageModel = (sequelize) => {
    const HomePage = sequelize.define('HomePage', {
        table_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        title_text: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        heading_text: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        contents: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        image_1: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        image_2: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        image_3: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
    }, {
        tableName: 'home_page',
        timestamps: false,
    });

    return HomePage;
};

export default HomePageModel;
