import { DataTypes } from 'sequelize';

const CstCreditsUsedModel = (sequelize) => {
  const CstCreditsUsed = sequelize.define(
    'CstCreditsUsed',
    {
      credit_used_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      customer_id: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      product_id: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      proxy_id: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      endpoint_id: {
        type: DataTypes.BIGINT,
        allowNull: true
      },
      added_date: {
        type: DataTypes.DATE,
        allowNull: true
      },
      api_url: {
        type: DataTypes.STRING,
        allowNull: true
      },
      request_body: {
        type: DataTypes.STRING,
        allowNull: true
      },
      response_body: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'cst_credits_used',
      timestamps: false
    }
  );

  return CstCreditsUsed;
};

export default CstCreditsUsedModel;
