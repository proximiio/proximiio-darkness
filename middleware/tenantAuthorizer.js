"use strict";

var Tenant = require('../tenant');

/**
 * Tenant Authorization Middleware, breaks middleware chain if unauthorized request is met
 * requires consumer object to be present in req
 *
 * @category MiddleWare
 * @param {SchemaManager} schemaManager
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var TenantAuthorizer = function(schemaManager) {
    return function(req, res, next) {
        if (req.isWhitelisted) {
            next();
        } else {
            var state = {};

            /**
             * Convenience method for error request responses
             *
             * @param {Object} res - Response
             */
            var respondWithError = function(rez) {
                return function(error) {
                    console.log('should respond with error', error.code, error.json);
                    rez.status(error.code).send(error.json);
                };
            };

            /**
             * Checks if all prerequistes for JWT access are met (req.consumer set etc)
             *
             * @returns {Promise}
             */
            var checkPrerequisites = function() {
                return new Promise(function(resolve, reject) {
                    if (req.hasOwnProperty('consumer') && req.consumer.hasOwnProperty('id')) {
                        resolve(req.consumer.id);
                    } else {
                        var error = new ConsumerMissingError();
                        reject(error);
                    }
                })
            };

            /**
             * Loads Tenant by Consumer ID, uses cache if available or direct datastore
             *
             * @param {String} consumerId
             * @returns {Promise}
             */
            var loadTenant = function(consumerId) {
                if (typeof state.tenant == 'undefined') {
                    return Tenant.get(req.consumer.id, schemaManager).then(function(tenant) {
                        return schemaManager.redisClient.setAsync(consumerId, JSON.stringify(tenant.data)).then((redisResult) => {
                            return tenant;
                        })
                    });
                } else {
                    return state.tenant;
                }
            };

            /**
             * Authorizes Token
             *
             * @param {Tenant} tenant
             * @returns {Promise}
             */
            var authorizeToken = function(tenant) {
                state.tenant = tenant;
                return tenant.authorizeToken(req.consumer.token);
            };

            /**
             * Sets Access Level with token
             *
             * @param {Object} tokenPayload
             * @returns {Promise}
             */
            var setAccessLevel = function(tokenPayload) {
                return new Promise(function(resolve, reject) {
                    var hasWriteAccess = tokenPayload.type == 'user';
                    var needsWriteAccess = req.method != 'GET';
//                    var writable = ['/core/events', '/core/visitors'];
                    resolve(tokenPayload);
/*                    if (needsWriteAccess) {
                        if (hasWriteAccess) {
                            resolve(tokenPayload);
                        } else {
                            reject(new PermissionDeniedError());
                        }
                    } else {
                        resolve(tokenPayload)
                    }
*/
                });
            };

            let getCache = (consumerId) => {
                if (schemaManager.settings().redis.enabled) {
                    return schemaManager.redisClient.getAsync(consumerId).then((result) => {
                        if (result) {
                            var tenant = new Tenant(JSON.parse(result), schemaManager);
                            state.tenant = tenant;
                        }
                        return consumerId;
                    });
                } else {
                    return consumerId;
                }
            };

            checkPrerequisites()
                .then(loadTenant)
                .then(authorizeToken)
                .then(setAccessLevel)
                .then(function(tokenPayload) {
                    req.tenant = state.tenant;
                    req.token = tokenPayload;
                    next();
                })
                .catch(respondWithError(res));
        }
    }
};

module.exports = TenantAuthorizer;
