var Promise = require('bluebird');
var express = require('express');
var router = express.Router();
var emailValidator = require('./helpers/emailValidator');
var NotAllowedError = require('./errors/notAllowedError');
var InvalidEmailFormatError = require('./errors/invalidEmailFormatError');
var EmailUniquenessError = require('./errors/emailUniquenessError');
var StatusCodeError = require('./errors/statusCodeError');
var DarkError = require('./errors/darkError');

var KongManager = require('./kong_manager');
var TokenManager = require('./token_manager');
var Tenant = require('./tenant');
var User = require('./user');

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
     * @param name
     * @param email
     * @param password
     * @returns {Function}
     */
    var addUserAccount = function(name, email, password) {
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
                .then(addUserAccount(params.name, params.email, params.password))
                .then(function(tenant) {
                    res.send(tenant.public());
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
