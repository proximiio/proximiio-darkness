"use strict";

var Tenant = require('../tenant');
var requestPromise = require('request-promise');
var Log = require('../logger');

/**
 * Remote Tenant Authorization Middleware, breaks middleware chain if unauthorized request is met
 * requires consumer object to be present in req
 * requires authService to be set to remote and have url present in app schema
 *
 * @category MiddleWare
 * @param {SchemaManager} schemaManager
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var RemoteTenantAuthorizer = function(schemaManager) {
    var TAG = 'RemoteTenantAuthorizer';
    return function(req, res, next) {
        console.log(TAG, "req.isWhitelisted: ", req.isWhitelisted);
        if (req.isWhitelisted) {
            next();
        } else {
            var state = {};

            /**
             * Convenience method for error request responses
             *
             * @param {Object} res - Response
             */
            var respondWithError = function(res) {
                return function(error) {
                    res.status(error.code).send(error.json);
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

            var remoteVerify = function(consumerId) {
                var uri = schemaManager.schema.authService.url + '/authorize';
                var issuer = schemaManager.schema.name + ' (' + schemaManager.schema.version + ')';
                return requestPromise({
                    uri: uri,
                    method: 'POST',
                    headers: {
                        'Authorization': req.headers.authorization,
                        'x-consumer-id': req.consumer.consumerId,
                        'x-consumer-custom-id': req.consumer.id,
                        'x-consumer-name': req.consumer.name,
                        'x-authorization-request-issuer': issuer
                    },
                    json: true,
                    body: {
                        'path': req.path,
                        'method': req.method,
                        'consumer_id': req.consumer.id,
                        'token': req.consumer.token
                    }
                })
            };

            /**
             * Sets Access Level with token
             *
             * @param {Object} Remote Authorization Object
             * @returns {Promise}
             */
            var setAccessLevel = function(auth) {
                return new Promise(function(resolve, reject) {
                    var authorized = function() {
                        resolve(auth);
                    };

                    var forbidden = function() {
                        reject(new PermissionDeniedError());
                    };

                    var hasWriteAccess = auth.tokenPayload.type == 'user';
                    var needsWriteAccess = req.method != 'GET';

                    if (needsWriteAccess) {
                        if (hasWriteAccess) {
                            authorized();
                        } else {
                            forbidden();
                        }
                    } else {
                        authorized();
                    }
                });
            };

            checkPrerequisites()
                .then(remoteVerify)
                .then(setAccessLevel)
                .then(function(authResponse) {
                    req.tenant = authResponse.tenant;
                    req.user = authResponse.user;
                    req.token = authResponse.tokenPayload;
                    //Log.d(TAG, `token ${req.headers.authorization} authorized`);
                    next();
                })
                .catch(respondWithError(res));
        }
    }
};

module.exports = RemoteTenantAuthorizer;
