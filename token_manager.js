var jwt = require('jwt-simple');

/**
 * Encodes JSON payload into JWT Token
 * @param {Object|Array|String|Number} payload
 * @param {String} secret
 * @returns {String}
 */
var encode = function(payload, secret) {
    return jwt.encode(payload, secret);
};

/**
 * Decodes JSON Payload from JWT
 *
 * @param {String} token
 * @param {String} secret
 * @returns {Object|Array|String|Number} payload
 */
var decode = function(token, secret) {
    try {
        return jwt.decode(token, secret);
    } catch(err) {
        return null;
    }
};

/**
 * Generates User Token
 *
 * @param {String} key
 * @param {String} secret
 * @param {String} tenantId
 * @returns {String} JWT Token
 */
var userToken = function(key, secret, tenantId, user) {
    return jwt.encode({
        "typ": "JWT",
        "alg": "HS256",
        "iss": key,
        "type": "user",
        "user": user.getName(),
        "user_id": user.getId(),
        "tenant_id": tenantId
    }, secret);
};

/**
 * Generates Application Token
 *
 * @param {String} key
 * @param {String} secret
 * @param {String} applicationId
 * @returns {String} JWT Token
 */
var applicationToken = function(key, secret, applicationId) {
    return jwt.encode({
        "typ": "JWT",
        "alg": "HS256",
        "iss": key,
        "type": "application",
        "application_id": applicationId
    }, secret);
};

module.exports = {
    encode: encode,
    decode: decode,
    userToken: userToken,
    applicationToken: applicationToken
};
