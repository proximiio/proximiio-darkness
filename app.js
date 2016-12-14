"use strict";
require('ssl-root-cas/latest').inject();
var _ = require('underscore');
var fs = require('fs');
var colors = require('colors');
var express = require('express');
var cors = require('cors');
var yaml = require('write-yaml');
var Log = require('./logger');
var SchemaManager = require('./schema_manager');
var SchemaExport = require('./schema_export');
var AuthController = require('./auth_controller');
var DynaAutoDiscovery = require('./dyna/autodiscovery');
var listRoutes = require('./helpers/listRoutes');
var User = require('./user');
var Tenant = require('./tenant');
var TokenManager = require('./token_manager');
var PasswordGenerator = require('password-generator');
var requestPromise = require('request-promise');
var BoolConverter = require('./middleware/boolConverter.js');
var kue = require('kue');
var kueUI = require('kue-ui');
var responseTime = require('response-time');

kueUI.setup({
  apiURL: '/kue-api',
  baseURL: '/kue',
  updateInterval: 5000
});

/**
 * Darkness Object
 * add custom code to callback which is called after app initialization
 *
 * @constructor
 */
var appSchema;
var Darkness = function() {};

/**
 * Starts Darkness Application built from schema
 *
 * @param {String} schemaFilePath - Path to Application Schema JSON file
 * @param callback - called after application launch is complete, customizations come here
 */
Darkness.start = function(schemaFilePath, callback) {
    var __measureExecTitle= "Darkness Execution Time", __measureExecTime = process.hrtime();

    appSchema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
    var schemaManager = new SchemaManager(appSchema, 'development');

    Log.system('DarknessFramework', 'starting application', appSchema.name.cyan.bold + (' ('+appSchema.version+')').white.bold);

    var port = process.env.PORT || schemaManager.settings().servers.http.port;
    var resourcesRoot = appSchema.apiRoot;
    var app = express();
    app.use(responseTime())



    app.schemaManager = schemaManager;

    app._startedAt = new Date();
    app._requestsCount = 0;
    let setMiddleware = (app) => {
        app.use(function(req, res, next) {
          app._requestsCount++; 
          next();
        });
        app.use(cors());
	app.use(function(req, res, next) {
	  req.headers['content-type'] = req.headers['content-type'] || 'application/json';
	  next();
	});
        app.get('/core/health', function(req, res) {
          res.send(JSON.stringify({start: app._startedAt, requests: app._requestsCount}));
        });
        var bodyParser = require('body-parser');
        app.use(express.static(__dirname + '/public'));
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use(require('./middleware/request_logger'));
        app.use('/kue-api', kue.app);
        app.use('/kue', kueUI.app);
        app.use(function (req, res, next) {
          if (typeof req.body["_boolConvert"] != "undefined") {
            for (var attribute in req.body["_boolConvert"]) {
              var value = req.body["_boolConvert"][attribute];
              req.body[attribute] = value == "true" ? true : false;
            }
            delete req.body["_boolConvert"];
          }
          next();
        });
	app.use(function (req, res, next) {
	  res.header("Content-Type",'application/json');
	  next();
	});

        app.use(require('./middleware/whitelist')(appSchema.urlWhitelist));

        if (appSchema.apiRouter.enabled && appSchema.apiRouter.type == 'kong') {
            app.use(require('./middleware/kongConsumer')());
        }

        if (appSchema.authService.type == 'local') {
            app.use(require('./middleware/tenantAuthorizer')(schemaManager));
            Log.system('TenantAuthorizer', 'active'.green.bold);
        } else {
            app.use(require('./middleware/remoteTenantAuthorizer')(schemaManager));
            Log.system('RemoteTenantAuthorizer', 'using remote authService at '.white + appSchema.authService.url.yellow.bold);
        }
        return app;
    };

    let initAuthController = (app) => {
        let authController = new AuthController(schemaManager);
        app.use(schemaManager.schema.authRoot, authController.router);
        Log.system('AuthController', 'exposed to '.white + authController.authRoot.yellow.bold + ' endpoint'.white);
        return app;
    };

    let exposeSchemas = (app) => {
        var schemaExport = new SchemaExport(schemaManager);
        app.use(schemaManager.schema.export.root, schemaExport.router);
        Log.system('SchemaExport', 'schema exposed to '.white + schemaManager.schema.export.root.yellow.bold + ' endpoint'.white);
        return app;
    };

    let initRestControllers = (app) => {
        _.each(schemaManager.restControllers(), function(controller) {
            app.use(resourcesRoot, controller.router);
            Log.system(controller.tag, 'resource: '.white + controller.resource.green.bold + ' exposed to '.white + (resourcesRoot + '/' + controller.plural).yellow.bold + ' endpoint'.white);
        });
        return app;
    };

    let exposeSwagger = (app) => {
        app.get(appSchema.explorerRoot + '/swagger/def', schemaManager.swaggerDefResponse);
        Log.system('SwaggerUI', 'exposed to ' + (appSchema.explorerRoot + '/swagger/def').yellow.bold);
        return app;
    };

    let dynaDiscoverAndExpose = (app) => {
        return DynaAutoDiscovery(schemaManager)
            .then(function(dynaRouters) {
                "use strict";
                dynaRouters.forEach((dynaRouter) => {
                    app.use('/geo', dynaRouter.router);
                    listRoutes(dynaRouter.router);
                });
                return app;
            });
    };

    let startWebServer = (app) => {
        app.listen(port);
        Log.system('WebServer', 'running at port', (port+'').green.bold);
        return app;
    };

    let finalize = (app) => {
        Log.system('DarknessFramework', 'application', appSchema.name.cyan.bold, 'started');
        var __measureExecTime2 = process.hrtime(__measureExecTime);
        var __executionTime = `${__measureExecTitle} ${__measureExecTime2[0]}.${Math.round(__measureExecTime2[1]/(1000*1000))}s`;

        var currentUser = function(req, res) {
            if (req.token.type == 'user') {
              User.findByToken(req.consumer.token, schemaManager).then(function(user) {
                var response = user.public();
                response[schemaManager.getTenantIdField()] = req.tenant.id;
                response.organization = req.tenant.public();
                response.tokens = req.tenant.decodeTokens();
                response.type = 'user';
                response.data = user.data;
                schemaManager.storage.table('applications')
                           .getAll(req.tenant.id, {index: 'organization_id'})
                           .then((applications) => {
                             if (typeof applications != "undefined" && applications.length > 0) {
                               response.application = applications[0];
                             }
                             response.token = req.consumer.token;
                             res.send(JSON.stringify(response));
                           }); 
              }).catch(function(error) {
                res.send(JSON.stringify({error: error}));
              });
            } else {
              var response = req.tenant.public();
              response[schemaManager.getTenantIdField()] = req.tenant.id;
              response.organization = req.tenant.public();
              response.tokens = req.tenant.decodeTokens();
              response.data = req.tenant.data;
              schemaManager.storage.table('applications')
                           .get(req.token.application_id)
                           .then((application) => {
                             response.type = 'application';
                             response.application = application;
                             response.token = req.consumer.token;
                             res.send(JSON.stringify(response));
                           });
            }
        };

        app.get('/core/current_user', currentUser);

        var update = function(req, res) {
          var company = req.body.organization.name;
          var background = req.body.organization.background;
          var country = req.body.organization.country;
          var firstName = req.body.first_name;
          var lastName = req.body.last_name; 
          var fullName = firstName + ' ' + lastName;
          var mapProvider = req.body.organization.mapProvider;
          var provider = req.body.organization.provider;
          var address = req.body.address;
          var vat = req.body.vat;
          console.log('body', req.body);
          var data = {updatedAt: new Date()};

          if (typeof req.body.organization.name != "undefined") {
            data.company = req.body.organization.name;
          }

          if (typeof req.body.organization.background != "undefined") {
            data.background = req.body.organization.background;
          }

          if (typeof req.body.organization.country != "undefined") {
            data.background = req.body.organization.country;
          }

          if (typeof req.body.first_name != "undefined" && typeof req.body.last_name != "undefined") {
            data.first_name = req.body.first_name;
            data.last_name = req.body.last_name;
            data.name = data.first_name + ' ' + data.last_name; 
          }

          if (typeof req.body.organization != "undefined" && req.body.organization.provider != "undefined") {
            data.provider = req.body.organization.provider;
          } 

          if (typeof req.body.organization != "undefined" && req.body.organization.address != "undefined") {
            data.address = req.body.organization.address;
          }

          if (typeof req.body.organization != "undefined" && req.body.organization.vat != "undefined") {
            data.vat = req.body.organization.vat;
          }

          console.log('should save data: ', data, 'mapProvider', mapProvider);
          schemaManager.storage.table('organizations').get(req.tenant.id).update(data).then((result) => {
            return Tenant.get(req.tenant.id, schemaManager).then((tenant) => {
              return schemaManager.redisClient.setAsync(req.headers["x-consumer-custom-id"], JSON.stringify(tenant.data)).then((redisResult) => {
                return tenant;
              });
            });
          }).then((tenant) => {
            req.tenant = tenant;
            User.findByToken(req.consumer.token, schemaManager).then(function(user) {
                schemaManager.storage.table('users').get(user.getId()).update(update).then((result) => {
                  User.findByToken(req.consumer.token, schemaManager).then(function(user) {
                    var response = user.public();
                    response[schemaManager.getTenantIdField()] = req.tenant.id;
                    response.organization = req.tenant.public();
                    response.tokens = req.tenant.decodeTokens();
                    response.data = user.data;
                    res.send(JSON.stringify(response));
                  });
                });
            }).catch(function(error) {
                res.send(JSON.stringify({error: error}));
            });
          });          
        };

        app.post('/core/auth/update', update);

        let changePassword = (req, res) => {
          let password = req.body.password;
          let encodedPassword = TokenManager.encode(password, schemaManager.schema.secret);
          let changePassword = (user) => {
             return user.changePassword(encodedPassword)
                        .then((user) => {
                          return user;
                        });
          };

          var sendEmail = function(user) {
              var data = user.public();
              data.password = password;
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
              .then(function(user) {
                    res.send(JSON.stringify(user.public()));
              })
              .catch((error) => {
                console.log('error:', error);
                res.status(500).send(error);
              });
        };

        app.post('/core/auth/change_password', changePassword);

        var route, routes = [];

        app._router.stack.forEach(function(middleware){
            if(middleware.route){ // routes registered directly on the app
                routes.push(middleware.route);
            } else if(middleware.name === 'router'){ // router middleware
                middleware.handle.stack.forEach(function(handler) {
                    route = handler.route;
                    route && routes.push(route);
                });
            }
        });

        Log.d('DarknessFramework', __executionTime);
        callback(app);
    };

    schemaManager.storageManager.ensureReady()
        .then(function() {
            Log.system(schemaManager.storageManager.tag, ' ready'.green.bold);
            return app;
        })
        .then(setMiddleware)
        .then(initAuthController)
        .then(exposeSchemas)
        .then(initRestControllers)
        .then(dynaDiscoverAndExpose)
        .then(exposeSwagger)
        .then(startWebServer)
        .then(finalize)
        .catch((error) => {
            "use strict";
            Log.error("DarknessError", error);
        });
};

Darkness.Common = {
    GeoPoint: require('./common/geo_point')
};

Darkness.ElasticAdapter = require('./elastic_adapter');

Darkness.firebaseQueue = require('./queue/firebaseQueue');

Darkness.Dyna = {
    Controller: require('./dyna/controller'),
    Method: require('./dyna/method')
};


module.exports = Darkness;
