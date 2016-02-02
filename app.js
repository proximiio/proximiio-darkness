var _ = require('underscore');
var fs = require('fs');
var colors = require('colors');
var express = require('express');
var yaml = require('write-yaml');
var Log = require('./logger');
var SchemaManager = require('./schema_manager');
var SchemaExport = require('./schema_export');
var AuthController = require('./auth_controller');

module.exports = {
    start: function(schemaFilePath, callback) {
        var appSchema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf8'));
        var schemaManager = new SchemaManager(appSchema, process.argv[2]);
        Log.system('DarknessFramework', 'starting application', appSchema.name.cyan.bold + (' ('+appSchema.version+')').white.bold);

        var app = express();

        // middlewares
        var bodyParser = require('body-parser');

        app.use(express.static(__dirname + '/public'));
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use(require('./request_logger'));
        app.use(require('./middleware/whitelist')(appSchema.urlWhitelist));
        app.use(require('./middleware/kongConsumer')());
        app.use(require('./middleware/apiKeyReader')());
        app.use(require('./middleware/organizationAuthorizer')({datastore: schemaManager.storage}));

        var port = process.env.PORT || schemaManager.settings().servers.http.port;
        var resourcesRoot = appSchema.apiRoot;

        schemaManager.storageManager.ensureReady(function(error) {
            if (error) {
                Log.error(schemaManager.storageManager.tag, error);
            } else {
                Log.system(schemaManager.storageManager.tag, ' ready'.green.bold);

                // expose schemas
                var schemaExport = new SchemaExport(schemaManager);
                var authController = new AuthController(schemaManager);

                app.use(schemaManager.schema.export.root, schemaExport.router);
                Log.system('SchemaExport', 'schema exposed to '.white + schemaManager.schema.export.root.yellow.bold + ' endpoint'.white);

                // REST Controllers
                _.each(schemaManager.restControllers(), function(controller) {
                    app.use(resourcesRoot, controller.router);
                    Log.system(controller.tag, 'resource: '.white + controller.resource.green.bold + ' exposed to '.white + (resourcesRoot + '/' + controller.plural).yellow.bold + ' endpoint'.white);
                });

                // Auth Controller
                app.use(authController.authRoot, authController.router);
                Log.system('AuthController', 'schema exposed to '.white + authController.authRoot.yellow.bold + ' endpoint'.white);

                // expose swagger-ui
                app.get(appSchema.explorerRoot + '/swagger/def', schemaManager.swaggerDefResponse);
                Log.system('SwaggerUI', 'exposed to ' + (appSchema.explorerRoot + '/swagger/def').yellow.bold);

                // start webserver
                app.listen(port);
                Log.system('WebServer', 'running at port', (port+'').green.bold);
                Log.system('DarknessFramework', 'application', appSchema.name.cyan.bold, 'started');
                callback();
            }
        });
    }
};