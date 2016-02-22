"use strict";

var express = require('express');
var router = express.Router();
var Tenant = require('./tenant');
var User = require('./user');
var RegistrationController = require('./registration_controller');
var TokenManager = require('./token_manager');

module.exports = function RestController(schemaManager) {

    this.authRoot = schemaManager.schema.authRoot;

    /**
     * Convenience method for error request responses
     *
     * @param {Object} res - Response
     */
    var respondWithError = function(res) {
        return function(error) {
            res.status(error.code).send(error.json);
        }
    };

    /**
     * Login Api Endpoint
     *
     * @param req
     * @param res
     */
    var login = function(req, res) {
        var email = req.body.email;
        var password = req.body.password;
        var encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);

        var loadTenantAndBuildResponse = function(user) {
            return user.getTenant().then(function(tenant) {
                var response = {
                    user: user.public(),
                    token: user.getToken()
                };
                response[schemaManager.schema.multitenancy.entity] = tenant.public();
                return response;
            });
        };

        User.findByEmailAndPassword(email, encodedPassword, schemaManager)
            .then(loadTenantAndBuildResponse)
            .then(function(response) {
                res.send(JSON.stringify(response));
            })
            .catch(respondWithError(res));
    };

    /**
     * Logout Api Endpoint
     *
     * @param req
     * @param res
     */
    var logout = function(req, res) {
        res.send(JSON.stringify({success: true}));
    };

    /**
     * Current User Api Endpoint
     *
     * @param req
     * @param res
     */
    var currentUser = function(req, res) {
        User.findByToken(req.consumer.token, schemaManager).then(function(user) {
            res.send(JSON.stringify(user.public()));
        }).catch(respondWithError(res));
    };

    var authorize = function(req, res) {
        var authRequest = req.body;

        var authorizeToken = function(tenant) {
            return tenant.authorizeToken(authRequest.token).then(function(payload) {
                return {
                    tenant: tenant.public(),
                    tokenPayload: payload
                }
            });
        };

        var assignTokenTypeEntity = function(authResponse) {
            if (authResponse.tokenPayload.type == 'user') {
                return User.get(authResponse.tokenPayload.user_id, schemaManager).then(function(user) {
                    authResponse.user = user.public();
                    return authResponse;
                });
            } else {
                return authResponse;
            }
        };

        var respond = function(authResponse) {
            res.send(authResponse);
        };

        Tenant.get(req.body.consumer_id, schemaManager)
              .then(authorizeToken)
              .then(assignTokenTypeEntity)
              .then(respond);
    };

    var tokens = (req, res) => {
        var tokens = req.tenant.data.tokens;
        var credentials = req.tenant.getConsumerCredentials();
        var decrypted = [];
        tokens.forEach((token) => {
            decrypted.push(TokenManager.decode(token, credentials));
        });
        res.send(JSON.stringify(decrypted));
    };

    var registrationController = new RegistrationController(schemaManager);

    router.post('/login', login);
    router.post('/logout', logout);
    router.post('/authorize', authorize);
    router.get('/', currentUser);
    router.get('/tokens', tokens);
    router.use('/registration', registrationController.router);

    this.router = router;

    return this;
};
