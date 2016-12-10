"use strict";
var Promise = require('bluebird');
var express = require('express');
var router = express.Router();
var emailValidator = require(__dirname + '/helpers/emailValidator');
var NotAllowedError = require(__dirname + '/errors/notAllowedError');
var InvalidEmailFormatError = require(__dirname + '/errors/invalidEmailFormatError');
var EmailUniquenessError = require(__dirname + '/errors/emailUniquenessError');
var OrganizationExistsError = require(__dirname + '/errors/organizationExistsError');
var StatusCodeError = require(__dirname + '/errors/statusCodeError');
var DarkError = require(__dirname + '/errors/darkError');
var KongManager = require(__dirname + '/kong_manager');
var TokenManager = require(__dirname + '/token_manager');
var Tenant = require(__dirname + '/tenant');
var User = require(__dirname + '/user');
var requestPromise = require('request-promise');
 
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
            console.log('should respond with error', error);
            res.status(500).send(error.json);
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
                data.email = data.email.toLowerCase();
                if (typeof data.background == 'undefined' || data.background.length == 0) {
                  data.background = 'undefined';
                }
                if (typeof data.country == 'undefined' || data.country.length == 0) {
                  data.country = 'undefined';
                }
                data.red = { shared: false };
                if (typeof data.referral == 'undefined') {
                  data.referral = 'undefined';
                }
                data.plan = 'free';
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
            console.log('adding user account:', email, ' pass:', password);
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
                       .then(assignTokenToTenant)
                       .then((result) => {
                         console.log('add user account ready, returning tenant:', tenant);
                         return tenant;
                       });
        }
    };

    var loginUser = function(req, params) {
        console.log('loginUserX params:', params);
        var original = params.password;
        return (tenant) => {
          console.log('logging in user with email: ', params.email, ' password: ' , original);
          var encodedPassword = TokenManager.encode(original, schemaManager.schema.secret);

          var prepareResponse = function(user) {
              console.log('user loaded', user, ' preparing response');
              var response = {
                user: user.public(),
                token: user.getToken(),
                instance_id: req.body.instance_id
              }
              response[schemaManager.schema.multitenancy.entity] = tenant.public();
              return response;
          };

          return User.findByEmailAndPassword(params.email, encodedPassword, schemaManager)
                     .then(prepareResponse)
        }
    };

    let addApplication = function(tenant) {
        var application = {
          name: 'Default Application', 
          type: 'mobile',
          organization_id: tenant.getId(),
          settings: {
            eddystone: true,
            gpsgeofences: true,
            ibeacons: true,
            indooratlas: false,
            indooratlasapikey: "",
            indooratlasapikeysecret: "",
            steerpath: false,
            steerpathndd: ""
          }
        };
        return requestPromise({
          uri: 'https://api.proximi.fi/core/applications',
          method: 'POST',
          headers: {
              'Authorization': 'Bearer ' + tenant.data.tokens[0],
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: application
        }).then((response) => {
          console.log('application added with result:', response);
          console.log('returning tenant', tenant);
          return tenant;
        });
    };

    var sendWelcomeEmail = function(params) {
      return function(tenant) {
        return requestPromise({
          uri: 'https://api.proximi.fi/mailer/registration',
          method: 'POST',
          headers: {
              'Authorization': '129bea7fc6f6437ac38fd37c53f13982',
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: {
            header: {
              from: 'support@proximi.io',
              to: params.email,
              subject: "Welcome onboard"
            },
            data: params
          }
        }).then((response) => {
          return tenant;
        });
      }
    };

    var sendRegistrationAlertEmail = function(params) {
      return function(tenant) {
        return requestPromise({
          uri: 'https://api.proximi.fi/mailer/registration_alert',
          method: 'POST',
          headers: {
              'Authorization': '129bea7fc6f6437ac38fd37c53f13982',
              'x-authorization-request-issuer': schemaManager.schema.name + ' (' + schemaManager.schema.version + ')'
          },
          json: true,
          body: {
            header: {
              to: 'sales@proximi.io',
              cc: 'support@proximi.io',
              subject: "[Proximi.io] New Registration"
            },
            data: params
          }
        }).then((response) => {
          return tenant;
        });
      }
    };

    const verifyUniqueness = (params) => {
      return (isAllowed) => {
        console.log('verifying uniqueness for name:', params.company);
        return schemaManager.storage.table('organizations')
         .getAll(params.company, { index: 'company' })
         .then((organizations) => {
           console.log('found ' + organizations.length + ' companies with name', params.company, organizations);
           if (organizations.length > 0) {
             throw new OrganizationExistsError(); 
           } else {
             return isAllowed;
           }
         });
      }
    }

    /**
     * Registration Api Endpoint
     *
     * @param req
     * @param res
     */
    var registration = function(req, res) {
        var params = req.body;
        params.name = params.last_name + " " + params.first_name;
        if (emailValidator.format(params.email.toLowerCase())) {
            emailValidator.uniqueness(schemaManager, params.email.toLowerCase())
                .then(verifyUniqueness(params))
                .then(createTenant(params))
                .then(addKongConsumer)
                .then(addKongConsumerCredentials)
                .then(addUserAccount(params.name, params.email.toLowerCase(), params.password))
                .then(addApplication)
                .then(sendWelcomeEmail(params))
                .then(sendRegistrationAlertEmail(params))
                .then(loginUser(req, params))
                .then(function(response) {
                    res.send(response);
                })
                .error(respondWithError(res))
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
