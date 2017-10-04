"use strict";
var express = require('express');
var router = express.Router();
var Tenant = require('./tenant');
var User = require('./user');
var RegistrationController = require('./registration_controller');
var TokenManager = require('./token_manager');
var PasswordGenerator = require('password-generator');
var requestPromise = require('request-promise');
var stripeQueue = require(__dirname + '/queue/stripeQueue');

module.exports = function AuthController(schemaManager) {

    this.authRoot = schemaManager.schema.authRoot;

    stripeQueue.setStorage(schemaManager.storage);
    stripeQueue.setToken(schemaManager.schema.keys.stripe);

    /**
     * Convenience method for error request responses
     *
     * @param {Object} res - Response
     */
    let respondWithError = function(res) {
        return function(error) {
            console.log('error', error);
            res.status(error.code).send(error);
        }
    };

    let changePassword = (req, res) => {
      let password = req.body.password;
      let encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);
      
      let changePassword = (user) => {
         return user.changePassword(encodedPassword)
                    .then((user) => {
		      return user.public(); 
                    });
      }
       
      var sendEmail = function(user) {
        var data = user.public();

        return requestPromise({
          uri: 'https://api.proximi.fi/mailer/password_change',
          method: 'POST',
          headers: {
              'Authorization': '129bea7fc6f6437ac38fd37c53f13982',
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: {
            header: {
              from: 'support@proximi.io',
              to: user.data.email,
              bcc: 'matej.drzik@quanto.sk',
              subject: "Your password has been changed."
            },
            data: data
          }
        }).then((response) => {
          return user;
        });
      };
 
      User.get(req.token.user_id, schemaManager)
          .then(changePassword)
          .then(sendEmail)
          .then(function(response) {
                res.send(JSON.stringify(response));
          })
          .catch(respondWithError(res));
    }
 
    let resetPassword = (req, res) => {
      var email = req.query.email;
      console.log('should reset user with email: ', email);
      var password = PasswordGenerator(12, false); 
      var encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);

      var sendEmail = function(user) {
        var data = user.public();
        data.password = password;
        
        return requestPromise({
          uri: 'https://api.proximi.fi/mailer/password_reset',
          method: 'POST',
          headers: {
              'Authorization': '129bea7fc6f6437ac38fd37c53f13982',
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: {
            header: {
              from: 'support@proximi.io',
              to: user.data.email,
              bcc: 'support@proximi.io',
              subject: "Your password has been reset."
            },
            data: data
          }
        }).then((response) => {
          return user;
        });
      };

      User.findByEmail(email, schemaManager)
          .then((user) => {
            
            return user.changePassword(encodedPassword)
                       .then(sendEmail)
                       .then((user) => {
                         res.send(user.public());
                       });
          }).error(respondWithError(res)).catch(respondWithError(res));
    };

    let checkCompany = (req, res) => {
      var name = req.body.name;
      //console.log('searching organizations for name:', name, req.body);
      if (typeof name != "undefined" && name != null) { 
        schemaManager.storage.table('organizations').filter({company: name}).then((results) => {
          //console.log('company results', results);
          res.send({
            available: (Array.isArray(results) && results.length == 0)
          })
        });
      } else {
        res.send({available: false})
      }
    }    

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
        //console.log('login pw:', password, 'encoded', encodedPassword);
        var loadTenantAndBuildResponse = function(user) {
            return user.getTenant().then(function(tenant) {
                var response = {
                    user: user.public(),
                    token: user.getToken()
                };
                response[schemaManager.schema.multitenancy.entity] = tenant.public();
                return schemaManager.storage.table('applications')
                             .getAll(tenant.getId(), {index: 'organization_id'}) 
                             .then(function(applications) {
                               if (typeof applications != "undefined") {
                                 response.application = applications[0];
                               }
                               return response;
                             });
            });
        };

        User.findByEmailAndPassword(email, encodedPassword, schemaManager)
            .then(loadTenantAndBuildResponse)
            .then(function(response) {
                schemaManager.log('core-AuthController', 'Login successful', { organization_id: response.organization.id, email: email, client: req.headers.client });
                var sharedPortal = 'https://portal.proximi.io';
                //console.log('login organization', response.organization);
                if (req.headers.origin == sharedPortal && !response.organization.stripe && response.organization.plan != 'enterprise') {
                  //console.log('should create customer origin:', req.headers.origin, 'org.stripe:', response.organization.stripe, 'plan', response.organization.plan);
                  stripeQueue.createCustomer(response.organization, (error) => {
                    if (error) {
                      console.log('stripeError', error);
                    };
                    res.send(JSON.stringify(response));
                  });
                } else {
                  //console.log('login called, origin', req.headers.origin);
                  res.send(JSON.stringify(response));
                }
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

    let registrationController = new RegistrationController(schemaManager);

    router.post('/login', login);
    router.post('/logout', logout);
    router.post('/authorize', authorize);
    router.get('/', currentUser);
    router.post('/check_company', checkCompany);
    router.post('/reset_password', resetPassword);
    router.use('/registration', registrationController.router);

    this.router = router;

    return this;
};
