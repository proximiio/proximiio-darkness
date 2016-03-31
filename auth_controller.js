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
    let respondWithError = function(res) {
        return function(error) {
            res.status(error.code).send(error.json);
        }
    };

    let changePassword = (req, res) => {
      let password = req.body.password;
      let encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);
      
      let changePassword = (user) => {
         return user.changePassword(password)
                    .then((user) => {
		      return user.public(); 
                    });
      }
        
      User.get(req.token.user_id, schemaManager)
          .then(changePassword)
          .then(function(response) {
                res.send(JSON.stringify(response));
          })
          .catch(respondWithError(res));
    }
 
    let forgotPassword = (req, res) => {
      res.send({message: 'should send forgot password mail'});
    };

    let checkCompany = (req, res) => {
      var name = req.body.name;
      console.log('searching organizations for name:', name);
      schemaManager.storage.table('organizations').filter({company: name}).then((results) => {
        res.send({
          available: (Array.isArray(results) && results.length == 0)
        })
      });
    }    

    /**
     * Login Api Endpoint
     *
     * @param req
     * @param res
     */
    let login = function(req, res) {
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
    let logout = function(req, res) {
        res.send(JSON.stringify({success: true}));
    };

    /**
     * Current User Api Endpoint
     *
     * @param req
     * @param res
     */
    let currentUser = function(req, res) {
        User.findByToken(req.consumer.token, schemaManager).then(function(user) {
            res.send(JSON.stringify(user.public()));
        }).catch(respondWithError(res));
    };

    let authorize = function(req, res) {
        let authRequest = req.body;
        let authorizeToken = function(tenant) {
            return tenant.authorizeToken(authRequest.token).then(function(payload) {
                return {
                    tenant: tenant.public(),
                    tokenPayload: payload
                }
            });
        };

        let assignTokenTypeEntity = function(authResponse) {
            if (authResponse.tokenPayload.type == 'user') {
                return User.get(authResponse.tokenPayload.user_id, schemaManager).then(function(user) {
                    authResponse.user = user.public();
                    return authResponse;
                });
            } else {
                return authResponse;
            }
        };

        let respond = function(authResponse) {
            res.send(authResponse);
        };

        Tenant.get(req.body.consumer_id, schemaManager)
              .then(authorizeToken)
              .then(assignTokenTypeEntity)
              .then(respond);
    };

    let registrationController = new RegistrationController(schemaManager);

    router.post('/login', login);
    router.post('/logout', logout);
    router.post('/authorize', authorize);
    router.get('/', currentUser);
    router.post('/check_company', checkCompany);
    router.use('/registration', registrationController.router);
    router.use('/change_password', changePassword);
    router.use('/forgot_password', forgotPassword);

    this.router = router;

    return this;
};
