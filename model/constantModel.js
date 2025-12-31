export const Constants = {
    istOffsetMinutes: 330,
    url_type_product: 1,

    status_code: [
        { code: 200, text: "OK" },
        { code: 201, text: "Created" },
        { code: 400, text: "Bad Request" },
        { code: 401, text: "Unauthorized" },
        { code: 403, text: "Forbidden" },
        { code: 404, text: "ERROR" },
        { code: 405, text: "HTTP method not allowed" },
        { code: 415, text: "Unsupported Media Type" },
        { code: 422, text: "Unprocessable Entity" },
        { code: 429, text: "Too Many Requests" },
        { code: 500, text: "Internal Server Error" },
        { code: 501, text: "Internal Server Error" },
        { code: 502, text: "Bad Gateway" },
        { code: 503, text: "Service Unavailable" },
        { code: 504, text: "Gateway Timeout" },
        { code: 505, text: "Version Not Supported" }
    ],

    school_category: [
        { id: 1, name: "Primary" },
        { id: 2, name: "Secondary" },
        { id: 3, name: "Higher Education" }
    ],
    school_management: [
        { id: 1, name: "Government Aided" },
        { id: 2, name: "Private Aided" }
    ],
    school_type: [
        { id: 1, name: "Co-Educational" },
        { id: 2, name: "Boys" },
        { id: 3, name: "Girls" }
    ],
    school_class_from: [
        1, 2, 3, 4, 5, 6, 7, 8
    ],
    school_class_upto: [
        2, 3, 4, 5, 6, 7, 8, 9, 10
    ],
    school_designation: [
        { id: 1, name: "Head Master" },
        { id: 2, name: "School Principal" },
        { id: 3, name: "Others" }
    ],
    school_allowd_banks: [
        { id: 1, name: "State Bank of India" }
    ],

    routing_tab_data: [
        { id: 'defaultFix', name: 'Fix', services: [{ "name": "Karza", "selected": false }, { "name": "Signzy", "selected": false }], selectedServices: '', selectedtab: '', isSelectedTab: false, isFallback: false },
        { id: 'defaultSplit', name: 'Split', services: [{ "name": "Karza", "selected": false }, { "name": "Signzy", "selected": false }], selectedServices: '', selectedtab: '', isSelectedTab: false, isFallback: false },
        { id: 'defaultFallback', name: 'Fallback', services: [{ "name": "Karza", "selected": false }, { "name": "Signzy", "selected": false }], selectedServices: '', selectedtab: '', isSelectedTab: false, isFallback: false }
    ],

    proj_payment_order_id_int_prefix: 'INT',
    proj_payment_order_id_ext_prefix: 'EXT',
    proj_payment_order_id_funding_prefix: 'CFD',
    payment_api_order_date_format: 'yyyy-MM-ddThh:mm:ssO',
    proj_payment_retry_count: 0,

};

export default { Constants };
