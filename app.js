"use strict";

var _ = require('underscore');
var fs = require('fs');
var colors = require('colors');
var express = require('express');
var yaml = require('write-yaml');
var Log = require('./logger');
var SchemaManager = require('./schema_manager');
var SchemaExport = require('./schema_export');
var AuthController = require('./auth_controller');
var DynaAutoDiscovery = require('./dyna/autodiscovery');
var listRoutes = require('./helpers/listRoutes');
var User = require('./user');

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
    var schemaManager = new SchemaManager(appSchema, process.argv[2]);

    Log.system('DarknessFramework', 'starting application', appSchema.name.cyan.bold + (' ('+appSchema.version+')').white.bold);

    var port = process.env.PORT || schemaManager.settings().servers.http.port;
    var resourcesRoot = appSchema.apiRoot;
    var app = express();
    app.schemaManager = schemaManager;

    let setMiddleware = (app) => {
	app.use(function(req, res, next) {
	  req.headers['content-type'] = req.headers['content-type'] || 'application/json';
//          if (req.path != '/core_auth/login' || req.path != '/core_auth/registration') { 
  //          req.headers['content-type'] = 'application/json';
    //      }
          console.log('req headers content-type set to:', req.headers['content-type']);
	  next();
	});
        var bodyParser = require('body-parser');
        app.use(express.static(__dirname + '/public'));
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use(require('./request_logger'));
        //app.use(require('./middleware/contentTypeManager.js'));
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
		  app.use('/' + dynaRouter.endPoint, dynaRouter.router);
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
            User.findByToken(req.consumer.token, schemaManager).then(function(user) {
                var response = user;
                response[schemaManager.getTenantIdField()] = req[schemaManager.schema.multitenancy.entity];
                res.send(JSON.stringify(response));
            }).catch(function(error) {
                res.send(JSON.stringify({error: error}));
            });
        };

        app.get('/core/current_user', currentUser);

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

Darkness.Dyna = {
    Controller: require('./dyna/controller'),
    Method: require('./dyna/method')
};

module.exports = Darkness;
