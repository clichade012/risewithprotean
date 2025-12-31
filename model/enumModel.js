import Enum from 'enum';

export const EmailTemplates = new Enum({
    'ACTIVATION_LINK_AFTER_REG': 1,
    'ACTIVATION_LINK_RESET_PASS': 2,
    'ADMIN_USER_ACTIVATION_LINK': 3,
    'ADMIN_USER_RESET_PASS_LINK': 4,
    'CUSTOMER_APPROVED_EMAIL': 5,
    'CONTACT_US_REPLY': 6,
    'UPGRATE_TO_SANDBOX': 7,
    'BUSINESS_MAIL_AFTER_SIGNUP': 8,
    'DAILY_MIS_AUTO_MAILER': 9,
    'DAILY_MIS_FY_AUTO_MAILER': 10,
});

export const API_STATUS = new Enum({
    'CUSTOMER_REGISTERED': 4999,
    'SESSION_EXPIRED': 5000,
    'CUST_ACC_NOT_ACTIVE': 5001,
    'CUST_ACC_NOT_APPROVED': 5002,
    'ACTIVATION_LINK_EXPIRED': 5004,
    'RESET_LINK_EXPIRED': 5005,
    'PRODUCT_URL_INVALID': 5006,
    'CUSTOMER_ACTIVATED': 5007,
    'RELOAD_PAGE_DATA': 5008,
    'BACK_TO_DASHBOARD': 5009,
    'ALREADY_EXISTS': 406,

});

export const TRANSACTION_TYPE = new Enum({
    'Credited': 1,
    'Debited': 2,
    // TRANSACTION_TYPE.Credited.value
    // TRANSACTION_TYPE.Debited.value

});

export const STATUS_TYPE = {
    Pending: 'Pending',
    Completed: 'Completed',
    Downloaded: 'Downloaded',
    Deleted: 'Deleted',
    Failed: 'Failed'
};

export default {
    EmailTemplates,
    API_STATUS,
    TRANSACTION_TYPE,
    STATUS_TYPE
};
