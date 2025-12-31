import crypto from 'crypto';

const privateKey = `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`;

const publicKey = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAyBDt50QMW1f67HKVpIu0
LZi8bvvTL3RbEiUDZg2m47fRAPiCxoZyYhDvmuluktnHOY4kciEFgKTpZ4Gdudmb
BsvVtCkR98zCbs/Doz5KZKzC4Gii1Oj3fEk+pQElFu4verBCl90sU6ogdIc113ey
3/iXE5nOfXHUUil5NPrr4XBMHeG3txpRLZ5A7woHDIQ/BagWZ8Ge4Tt/RFzhQ5wz
x+bK0ThU6VbE2BReCtuZ7wJqQQj0C7uJ+to6Bijiep3YW/QEeXGhgenh/50qBlvJ
tPfm3SMu8Z0fo3yPLZ5lVKLKZ3IfCp00jXadSqCBr3gz8ckCQaB8B7dUVBFQPMd+
Ad99jmFCeqjMt9sn1E1RraYuLER0OZBTSwYY+3SAz5U2avJl1s/xLRkMR9VvxUCs
Ia1xWRD4WMR5UMc9VKlpC+XmQqCmvMipI/PxY3kJIZjo/SnF6YpG6+jBSdJV73Hi
Ga+kkE0KrniWVhfOKZGog8rIYbuze1Do8rZoSH4JL0Xwjgrziz3RmeDuOo8CnDSF
9uC2MVyjokG2y2Cs45l+mIpPlpHrDzqwaf4ATjFSxyDjLt7txgU8Tcx91alnQvlG
O2BbTVwIWgMZog0AZvT2Pe1Mq/Gybmyn/F3bzneLo2M8yggp1fKbWtOOCS+TM7WR
G5KYk9KL7nH3Ql9GR/ZbGTsCAwEAAQ==
-----END PUBLIC KEY-----`;

export const rsa_encrypt = function (toEncrypt) {
    let buffer = Buffer.from(toEncrypt);
    let encrypted = crypto.publicEncrypt({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    }, buffer);
    return encrypted.toString("base64");
};

export const rsa_decrypt = function (toDecrypt) {
    let buffer = Buffer.from(toDecrypt, "base64");
    let decrypted = crypto.privateDecrypt({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    }, buffer);
    return decrypted.toString("utf8");
};

export const rsa_set_key = function () {
    crypto.createPrivateKey(privateKey);
};

export default {
    rsa_set_key,
    rsa_encrypt,
    rsa_decrypt
};
