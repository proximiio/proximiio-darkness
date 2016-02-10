"use strict";
var Promise = require('bluebird');
var express = require('express');
var router = express.Router();
var emailValidator = require(__dirname + '/helpers/emailValidator');
var NotAllowedError = require(__dirname + '/errors/notAllowedError');
var InvalidEmailFormatError = require(__dirname + '/errors/invalidEmailFormatError');
var EmailUniquenessError = require(__dirname + '/errors/emailUniquenessError');
var StatusCodeError = require(__dirname + '/errors/statusCodeError');
var DarkError = require(__dirname + '/errors/darkError');

var KongManager = require(__dirname + '/kong_manager');
var TokenManager = require(__dirname + '/token_manager');
var Tenant = require(__dirname + '/tenant');
var User = require(__dirname + '/user');

var RegistrationController = function(schemaManager) {
    var _this = this;

    var kongManager = new KongManager(schemaManager);

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
     * Creates tenant
     *
     * @param {Object} Tenant data
     * @returns {Promise}
     */
    var createTenant = function(data) {
        return function(isAllowed) {
            if (isAllowed) {
                var tenant = new Tenant(data, schemaManager);
                return tenant.save();
            } else {
                throw new EmailUniquenessError();
            }
        }
    };

    /**
     * Creates Kong Consumer
     *
     * @param {Tenant} tenant
     * @returns {Promise}
     */
    var addKongConsumer = function(tenant) {
        return kongManager.createConsumer(tenant);
    };

    /**
     * Creates Kong Consumer Credentials
     *
     * @param {Tenant} tenant
     * @returns {Promise}
     */
    var addKongConsumerCredentials = function(tenant) {
        return kongManager.createConsumerCredentials(tenant);
    };

    /**
     * Adds Initial User Account and adds generated JWT Token to Tenant
     *
     * @param {String} name
     * @param {String} email
     * @param {String} password
     * @param {String} instanceId
     * @returns {Function}
     */
    var addUserAccount = function(name, email, password, instanceId) {
        return function(tenant) {
            var data = {
                name: name,
                email: email,
                instanceId: instanceId,
                password: TokenManager.encode(password, schemaManager.schema.secret)
            };
            data[schemaManager.getTenantIdField()] = tenant.getId();

            var user = new User(data, schemaManager);

            var assignTokenToUser = function(user) {
                var credentials = tenant.getConsumerCredentials();
                var token = TokenManager.userToken(credentials.key, credentials.secret, tenant.getId(), user);
                user.setToken(token);
                return user.save();
            };

            var assignTokenToTenant = function(user) {
                tenant.addToken(user.getToken());
                return tenant.save();
            };

            return user.save()
                       .then(assignTokenToUser)
                       .then(assignTokenToTenant);
        }
    };

    var addPortal = function(name, email, password, instanceId) {
        return function(tenant) {
            var data = {
                name: name,
                email: email,
                password: TokenManager.encode(password, schemaManager.schema.secret)
            };
            data[schemaManager.getTenantIdField()] = tenant.getId();

            var user = new User(data, schemaManager);

            var assignTokenToUser = function(user) {
                var credentials = tenant.getConsumerCredentials();
                var token = TokenManager.userToken(credentials.key, credentials.secret, tenant.getId(), user);
                user.setToken(token);
                return user.save();
            };

            var assignTokenToTenant = function(user) {
                tenant.addToken(user.getToken());
                return tenant.save();
            };

            return user.save()
                .then(assignTokenToUser)
                .then(assignTokenToTenant);
        }
    };

    var loginUser = function(req) {
        return function(tenant) {
            var email = req.body.email;
            var password = req.body.password;
            var encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);

            var prepareResponse = function (user) {
                var response = {
                    user: user.public(),
                    token: user.getToken(),
                    instance_id: req.body.instance_id,
                    eventBusRef: tenant.g
                };
                response[schemaManager.schema.multitenancy.entity] = tenant.public();
                return response;
            };

            return User.findByEmailAndPassword(email, encodedPassword, schemaManager)
                .then(prepareResponse)
        }
    };
    /**
     * Registration Api Endpoint
     *
     * @param req
     * @param res
     */
    var registration = function(req, res) {
        var params = req.body;
        if (emailValidator.format(params.email)) {
            emailValidator.uniqueness(schemaManager, params.email)
                .then(createTenant(params))
                .then(addKongConsumer)
                .then(addKongConsumerCredentials)
                .then(addUserAccount(params.name, params.email, params.password, params.instance_id))
                .then(loginUser(req))
                .then(function(response) {
                    res.send(response);
                })
                .catch(EmailUniquenessError, respondWithError(res))
                .catch(StatusCodeError, function(error) {
                    respondWithError(res)(new StatusCodeError(error.statusCode, error.message))
                })
                .catch(TypeError, function(error) {
                    respondWithError(res)(new DarkError("TypeError", 1000, error.message));
                })
                .catch(function(error) {
                    respondWithError(res)(new DarkError("OtherError", 1000, error.message));
                });
        } else {
            respondWithError(res)(new InvalidEmailFormatError());
        }
    };


    router.post('/', registration);
    this.router = router;

    return this;
};

module.exports = RegistrationController;
