/**
 * Models Index - Central Model Loader
 * Loads all models and defines relationships
 */

import FaqTypeModel from './FaqType.js';
import FaqDetailModel from './FaqDetail.js';
import AdmUserModel from './AdmUser.js';
import AdmTokenModel from './AdmToken.js';
import AdmRoleModel from './AdmRole.js';
import AdmPermissionModel from './AdmPermission.js';
import AdmRolePermissionModel from './AdmRolePermission.js';
import SettingsModel from './Settings.js';
import FeedbackCategoryModel from './FeedbackCategory.js';
import FeedbackDataModel from './FeedbackData.js';
import FeedbackReplyModel from './FeedbackReply.js';
import CstCustomerModel from './CstCustomer.js';
import AdmLinkResetModel from './AdmLinkReset.js';
import AdmLinkActModel from './AdmLinkAct.js';
import PageLabelInfoModel from './PageLabelInfo.js';
import MobileNetworkModel from './MobileNetwork.js';
import EmailTemplateModel from './EmailTemplate.js';
import SmsTemplateModel from './SmsTemplate.js';
// New models
import IndustryModel from './Industry.js';
import BusinessEmailModel from './BusinessEmail.js';
import CstTokenModel from './CstToken.js';
import HomePageModel from './HomePage.js';
import GetStartedModel from './GetStarted.js';
import CstAppMastModel from './CstAppMast.js';
import CstAppProductModel from './CstAppProduct.js';
import ProductModel from './Product.js';
import ProxiesModel from './Proxies.js';
import EndpointModel from './Endpoint.js';
import ProxySchemaModel from './ProxySchema.js';
import ProductPagesModel from './ProductPages.js';
import CstCreditsModel from './CstCredits.js';
import CstWalletsModel from './CstWallets.js';
import CstWalletsPaymentModel from './CstWalletsPayment.js';
import CstWalletsPaymentRespModel from './CstWalletsPaymentResp.js';
import CstWalletsCheckerModel from './CstWalletsCheker.js';
import AnalyticsFileObjectModel from './AnalyticsFileObject.js';
import ProductMonitazationRateModel from './ProductMonitazationRate.js';
import TermConditionsModel from './TermConditions.js';
import ProductRateAttributeModel from './ProductRateAttribute.js';
import ProductCategoryModel from './ProductCategory.js';
import AppProductRateModel from './AppProductRate.js';

const initModels = (sequelize) => {

    // Load all models
    const FaqType = FaqTypeModel(sequelize);
    const FaqDetail = FaqDetailModel(sequelize);
    const AdmUser = AdmUserModel(sequelize);
    const AdmToken = AdmTokenModel(sequelize);
    const AdmRole = AdmRoleModel(sequelize);
    const AdmPermission = AdmPermissionModel(sequelize);
    const AdmRolePermission = AdmRolePermissionModel(sequelize);
    const Settings = SettingsModel(sequelize);
    const FeedbackCategory = FeedbackCategoryModel(sequelize);
    const FeedbackData = FeedbackDataModel(sequelize);
    const FeedbackReply = FeedbackReplyModel(sequelize);
    const CstCustomer = CstCustomerModel(sequelize);
    const AdmLinkReset = AdmLinkResetModel(sequelize);
    const AdmLinkAct = AdmLinkActModel(sequelize);
    const PageLabelInfo = PageLabelInfoModel(sequelize);
    const MobileNetwork = MobileNetworkModel(sequelize);
    const EmailTemplate = EmailTemplateModel(sequelize);
    const SmsTemplate = SmsTemplateModel(sequelize);
    // New models
    const Industry = IndustryModel(sequelize);
    const BusinessEmail = BusinessEmailModel(sequelize);
    const CstToken = CstTokenModel(sequelize);
    const HomePage = HomePageModel(sequelize);
    const GetStarted = GetStartedModel(sequelize);
    const CstAppMast = CstAppMastModel(sequelize);
    const CstAppProduct = CstAppProductModel(sequelize);
    const Product = ProductModel(sequelize);
    const Proxies = ProxiesModel(sequelize);
    const Endpoint = EndpointModel(sequelize);
    const ProxySchema = ProxySchemaModel(sequelize);
    const ProductPages = ProductPagesModel(sequelize);
    const CstCredits = CstCreditsModel(sequelize);
    const CstWallets = CstWalletsModel(sequelize);
    const CstWalletsPayment = CstWalletsPaymentModel(sequelize);
    const CstWalletsPaymentResp = CstWalletsPaymentRespModel(sequelize);
    const CstWalletsChecker = CstWalletsCheckerModel(sequelize);
    const AnalyticsFileObject = AnalyticsFileObjectModel(sequelize);
    const ProductMonitazationRate = ProductMonitazationRateModel(sequelize);
    const TermConditions = TermConditionsModel(sequelize);
    const ProductRateAttribute = ProductRateAttributeModel(sequelize);
    const ProductCategory = ProductCategoryModel(sequelize);
    const AppProductRate = AppProductRateModel(sequelize);

    // Define relationships

    // FaqType has many FaqDetails
    FaqType.hasMany(FaqDetail, {
        foreignKey: 'type_id',
        sourceKey: 'type_id',
        as: 'faqDetails',
    });

    // FaqDetail belongs to one FaqType
    FaqDetail.belongsTo(FaqType, {
        foreignKey: 'type_id',
        targetKey: 'type_id',
        as: 'faqType',
    });

    // AdmUser belongs to AdmRole
    AdmUser.belongsTo(AdmRole, {
        foreignKey: 'role_id',
        targetKey: 'role_id',
        as: 'role',
    });

    // AdmRole has many AdmUsers
    AdmRole.hasMany(AdmUser, {
        foreignKey: 'role_id',
        sourceKey: 'role_id',
        as: 'users',
    });

    // AdmUser has many AdmTokens
    AdmUser.hasMany(AdmToken, {
        foreignKey: 'admin_id',
        sourceKey: 'admin_id',
        as: 'tokens',
    });

    // AdmToken belongs to AdmUser
    AdmToken.belongsTo(AdmUser, {
        foreignKey: 'admin_id',
        targetKey: 'admin_id',
        as: 'user',
    });

    // AdmRole has many AdmRolePermissions
    AdmRole.hasMany(AdmRolePermission, {
        foreignKey: 'role_id',
        sourceKey: 'role_id',
        as: 'rolePermissions',
    });

    // AdmPermission has many AdmRolePermissions
    AdmPermission.hasMany(AdmRolePermission, {
        foreignKey: 'permission_id',
        sourceKey: 'permission_id',
        as: 'rolePermissions',
    });

    // AdmRolePermission belongs to AdmRole
    AdmRolePermission.belongsTo(AdmRole, {
        foreignKey: 'role_id',
        targetKey: 'role_id',
        as: 'role',
    });

    // AdmRolePermission belongs to AdmPermission
    AdmRolePermission.belongsTo(AdmPermission, {
        foreignKey: 'permission_id',
        targetKey: 'permission_id',
        as: 'permission',
    });

    // FeedbackData belongs to FeedbackCategory
    FeedbackData.belongsTo(FeedbackCategory, {
        foreignKey: 'category_id',
        targetKey: 'category_id',
        as: 'category',
    });

    // FeedbackCategory has many FeedbackData
    FeedbackCategory.hasMany(FeedbackData, {
        foreignKey: 'category_id',
        sourceKey: 'category_id',
        as: 'feedbacks',
    });

    // FeedbackData has many FeedbackReplies
    FeedbackData.hasMany(FeedbackReply, {
        foreignKey: 'feedback_id',
        sourceKey: 'feedback_id',
        as: 'replies',
    });

    // FeedbackReply belongs to FeedbackData
    FeedbackReply.belongsTo(FeedbackData, {
        foreignKey: 'feedback_id',
        targetKey: 'feedback_id',
        as: 'feedback',
    });

    // FeedbackReply belongs to AdmUser (sent_by)
    FeedbackReply.belongsTo(AdmUser, {
        foreignKey: 'sent_by',
        targetKey: 'account_id',
        as: 'sender',
    });

    // CstCustomer belongs to Industry
    CstCustomer.belongsTo(Industry, {
        foreignKey: 'industry_id',
        targetKey: 'industry_id',
        as: 'industry',
    });

    // Industry has many CstCustomers
    Industry.hasMany(CstCustomer, {
        foreignKey: 'industry_id',
        sourceKey: 'industry_id',
        as: 'customers',
    });

    // CstCustomer belongs to MobileNetwork
    CstCustomer.belongsTo(MobileNetwork, {
        foreignKey: 'network_id',
        targetKey: 'network_id',
        as: 'mobileNetwork',
    });

    // MobileNetwork has many CstCustomers
    MobileNetwork.hasMany(CstCustomer, {
        foreignKey: 'network_id',
        sourceKey: 'network_id',
        as: 'customers',
    });

    // CstCustomer belongs to AdmUser (added_by)
    CstCustomer.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'admin_id',
        as: 'addedByUser',
    });

    // CstCustomer has many CstTokens
    CstCustomer.hasMany(CstToken, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'tokens',
    });

    // CstToken belongs to CstCustomer
    CstToken.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstCustomer has many CstAppMast
    CstCustomer.hasMany(CstAppMast, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'apps',
    });

    // CstAppMast belongs to CstCustomer
    CstAppMast.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstAppMast belongs to AdmUser (mkr_approved_by)
    CstAppMast.belongsTo(AdmUser, {
        foreignKey: 'mkr_approved_by',
        targetKey: 'account_id',
        as: 'mkrApprovedByUser',
    });

    // CstAppMast belongs to AdmUser (approved_by)
    CstAppMast.belongsTo(AdmUser, {
        foreignKey: 'approved_by',
        targetKey: 'account_id',
        as: 'approvedByUser',
    });

    // CstAppMast belongs to AdmUser (mkr_rejected_by)
    CstAppMast.belongsTo(AdmUser, {
        foreignKey: 'mkr_rejected_by',
        targetKey: 'account_id',
        as: 'mkrRejectedByUser',
    });

    // CstAppMast belongs to AdmUser (rejected_by)
    CstAppMast.belongsTo(AdmUser, {
        foreignKey: 'rejected_by',
        targetKey: 'account_id',
        as: 'rejectedByUser',
    });

    // CstAppMast has many CstAppProduct
    CstAppMast.hasMany(CstAppProduct, {
        foreignKey: 'app_id',
        sourceKey: 'app_id',
        as: 'appProducts',
    });

    // CstAppProduct belongs to CstAppMast
    CstAppProduct.belongsTo(CstAppMast, {
        foreignKey: 'app_id',
        targetKey: 'app_id',
        as: 'app',
    });

    // Product has many CstAppProduct
    Product.hasMany(CstAppProduct, {
        foreignKey: 'product_id',
        sourceKey: 'product_id',
        as: 'appProducts',
    });

    // CstAppProduct belongs to Product
    CstAppProduct.belongsTo(Product, {
        foreignKey: 'product_id',
        targetKey: 'product_id',
        as: 'product',
    });

    // Product has many Proxies
    Product.hasMany(Proxies, {
        foreignKey: 'product_id',
        sourceKey: 'product_id',
        as: 'proxies',
    });

    // Proxies belongs to Product
    Proxies.belongsTo(Product, {
        foreignKey: 'product_id',
        targetKey: 'product_id',
        as: 'product',
    });

    // Proxies has many Endpoints
    Proxies.hasMany(Endpoint, {
        foreignKey: 'proxy_id',
        sourceKey: 'proxy_id',
        as: 'endpoints',
    });

    // Endpoint belongs to Proxies
    Endpoint.belongsTo(Proxies, {
        foreignKey: 'proxy_id',
        targetKey: 'proxy_id',
        as: 'proxy',
    });

    // Endpoint has many ProxySchema
    Endpoint.hasMany(ProxySchema, {
        foreignKey: 'endpoint_id',
        sourceKey: 'endpoint_id',
        as: 'schemas',
    });

    // ProxySchema belongs to Endpoint
    ProxySchema.belongsTo(Endpoint, {
        foreignKey: 'endpoint_id',
        targetKey: 'endpoint_id',
        as: 'endpoint',
    });

    // Product has many ProductPages
    Product.hasMany(ProductPages, {
        foreignKey: 'product_id',
        sourceKey: 'product_id',
        as: 'pages',
    });

    // ProductPages belongs to Product
    ProductPages.belongsTo(Product, {
        foreignKey: 'product_id',
        targetKey: 'product_id',
        as: 'product',
    });

    // CstCustomer has many CstCredits
    CstCustomer.hasMany(CstCredits, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'credits',
    });

    // CstCredits belongs to CstCustomer
    CstCredits.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstCustomer has many CstWallets
    CstCustomer.hasMany(CstWallets, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'wallets',
    });

    // CstWallets belongs to CstCustomer
    CstWallets.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstCustomer has many CstWalletsPayment
    CstCustomer.hasMany(CstWalletsPayment, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'walletsPayments',
    });

    // CstWalletsPayment belongs to CstCustomer
    CstWalletsPayment.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstCustomer has many CstWalletsChecker
    CstCustomer.hasMany(CstWalletsChecker, {
        foreignKey: 'customer_id',
        sourceKey: 'customer_id',
        as: 'walletsChecker',
    });

    // CstWalletsChecker belongs to CstCustomer
    CstWalletsChecker.belongsTo(CstCustomer, {
        foreignKey: 'customer_id',
        targetKey: 'customer_id',
        as: 'customer',
    });

    // CstWalletsChecker belongs to AdmUser (added_by)
    CstWalletsChecker.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'account_id',
        as: 'addedByUser',
    });

    // CstWalletsChecker belongs to AdmUser (approved_by)
    CstWalletsChecker.belongsTo(AdmUser, {
        foreignKey: 'ckr_wallet_amount_approved_by',
        targetKey: 'account_id',
        as: 'approvedByUser',
    });

    // CstWalletsChecker belongs to AdmUser (rejected_by)
    CstWalletsChecker.belongsTo(AdmUser, {
        foreignKey: 'ckr_wallet_amount_rejected_by',
        targetKey: 'account_id',
        as: 'rejectedByUser',
    });

    // Product belongs to ProductMonitazationRate
    Product.belongsTo(ProductMonitazationRate, {
        foreignKey: 'monitization_rate_id',
        targetKey: 'rate_id',
        as: 'monitazationRate',
    });

    // ProductMonitazationRate has many Products
    ProductMonitazationRate.hasMany(Product, {
        foreignKey: 'monitization_rate_id',
        sourceKey: 'rate_id',
        as: 'products',
    });

    // ProductMonitazationRate belongs to AdmUser (added_by)
    ProductMonitazationRate.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'account_id',
        as: 'added_by_user',
    });

    // ProductMonitazationRate belongs to AdmUser (ckr_rate_plan_approved_by)
    ProductMonitazationRate.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_approved_by',
        targetKey: 'account_id',
        as: 'ckr_approved_by_user',
    });

    // ProductMonitazationRate belongs to Product
    ProductMonitazationRate.belongsTo(Product, {
        foreignKey: 'product_id',
        targetKey: 'product_id',
        as: 'product',
    });

    // ProductMonitazationRate belongs to AdmUser (ckr_rate_plan_rejected_by)
    ProductMonitazationRate.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_rejected_by',
        targetKey: 'account_id',
        as: 'rejected_by_user',
    });

    // TermConditions belongs to AdmUser (added_by)
    TermConditions.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'account_id',
        as: 'added_by_user',
    });

    // TermConditions belongs to AdmUser (modify_by)
    TermConditions.belongsTo(AdmUser, {
        foreignKey: 'modify_by',
        targetKey: 'account_id',
        as: 'modified_by_user',
    });

    // ProductRateAttribute belongs to Product
    ProductRateAttribute.belongsTo(Product, {
        foreignKey: 'product_id',
        targetKey: 'product_id',
        as: 'product',
    });

    // Product has many ProductRateAttribute
    Product.hasMany(ProductRateAttribute, {
        foreignKey: 'product_id',
        sourceKey: 'product_id',
        as: 'rateAttributes',
    });

    // ProductRateAttribute belongs to AdmUser (added_by)
    ProductRateAttribute.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'account_id',
        as: 'added_by_user',
    });

    // ProductRateAttribute belongs to AdmUser (ckr_rate_plan_approved_by)
    ProductRateAttribute.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_approved_by',
        targetKey: 'account_id',
        as: 'approved_by_user',
    });

    // ProductRateAttribute belongs to AdmUser (ckr_rate_plan_rejected_by)
    ProductRateAttribute.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_rejected_by',
        targetKey: 'account_id',
        as: 'rejected_by_user',
    });

    // AppProductRate belongs to CstAppMast
    AppProductRate.belongsTo(CstAppMast, {
        foreignKey: 'app_id',
        targetKey: 'app_id',
        as: 'app',
    });

    // CstAppMast has many AppProductRate
    CstAppMast.hasMany(AppProductRate, {
        foreignKey: 'app_id',
        sourceKey: 'app_id',
        as: 'productRates',
    });

    // AppProductRate belongs to AdmUser (added_by)
    AppProductRate.belongsTo(AdmUser, {
        foreignKey: 'added_by',
        targetKey: 'account_id',
        as: 'addedByUser',
    });

    // AppProductRate belongs to AdmUser (ckr_rate_plan_approved_by)
    AppProductRate.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_approved_by',
        targetKey: 'account_id',
        as: 'approvedByUser',
    });

    // AppProductRate belongs to AdmUser (ckr_rate_plan_rejected_by)
    AppProductRate.belongsTo(AdmUser, {
        foreignKey: 'ckr_rate_plan_rejected_by',
        targetKey: 'account_id',
        as: 'rejectedByUser',
    });

    return {
        FaqType,
        FaqDetail,
        AdmUser,
        AdmToken,
        AdmRole,
        AdmPermission,
        AdmRolePermission,
        Settings,
        FeedbackCategory,
        FeedbackData,
        FeedbackReply,
        CstCustomer,
        AdmLinkReset,
        AdmLinkAct,
        PageLabelInfo,
        MobileNetwork,
        EmailTemplate,
        SmsTemplate,
        // New models
        Industry,
        BusinessEmail,
        CstToken,
        HomePage,
        GetStarted,
        CstAppMast,
        CstAppProduct,
        Product,
        Proxies,
        Endpoint,
        ProxySchema,
        ProductPages,
        CstCredits,
        CstWallets,
        CstWalletsPayment,
        CstWalletsPaymentResp,
        CstWalletsChecker,
        AnalyticsFileObject,
        ProductMonitazationRate,
        TermConditions,
        ProductRateAttribute,
        ProductCategory,
        AppProductRate,
    };
};

export default initModels;
