var express = require('express');
var colors = require('colors');
var _ = require('underscore');
var router = express.Router();
var Log = require('./logger');

module.exports = function SchemaExport(schemaManager) {

    var _this = this;
    this.schemaManager = schemaManager;

    this.getRootURL = function() {
        return _this.schemaManager.schema.export.root;
    };

    _.each(Object.keys(schemaManager.resources), function(resource) {
        var modelUrl = '/Models/' + resource;
        router.get(modelUrl, function(req, res) {
            res.send(JSON.stringify(_this.schemaManager.resources[resource].schema));
        });

        var deletedModelUrl = '/Models/' + resource + '/deleted';
        router.get(deletedModelUrl, function(req, res) {
            var schema = _this.schemaManager.resources[resource].schema;
            schema.properties['isDeleted'] = {
                type: "boolean"
            };
            res.send(JSON.stringify(schema));
        });

        Log.system('SchemaExport', 'resource ' + resource.green.bold + ' schema exposed at: ' + modelUrl.yellow.bold);
        Log.system('SchemaExport', 'resource ' + resource.green.bold + '/deleted'.cyan.bold + ' schema exposed at: ' + deletedModelUrl.yellow.bold);
    });

    this.router = router;

    return this;
};