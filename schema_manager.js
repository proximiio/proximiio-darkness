"use strict";
var _ = require('underscore');
var pluralize = require('plur');
var SchemaToSwagger = require('./schema_to_swagger');
var RethinkManager = require('./rethink_manager');
var RestController = require('./rest_controller');
var SchemaModelHandler = require('./schema_model_handler');
var ElasticAdapter = require('./elastic_adapter');
var bluebird = require('bluebird');
var redis = require('redis');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

module.exports = function SchemaManager(schema, environment) {
    var _this = this;

    this.initialize = function() {
        this.schema = schema;
        this.environment = environment || process.env['DARKNESS_ENVIRONMENT'];
        this.apiRoot = this.schema.apiRoot;
        this.multitenancy = this.schema.multitenancy.enabled;
    };

    this.initialize();

    this.isResourcePublishable = function(resource) {
        return typeof _this.schema.resources[resource].publish == 'undefined' ||
            _this.schema.resources[resource].publish;
    };

    this.resourceNeedsDatabase = function(resource) {
        return typeof _this.schema.resources[resource].db == 'undefined' ||
            _this.schema.resources[resource].db;
    };

    this.resources = _this.schema.resources;
    this.resourceKeys = Object.keys(this.schema.resources);

    this.storage = function() { console.log('Storage not set')};
    this.storageManager = function() { console.log('StorageManager not set')};

    // configure rethinkmanager
    if (this.schema.settings[this.environment].datastore.type == 'rethinkdb') {
        this.datastoreSettings = this.schema.settings[this.environment].datastore;
        this.storage = require('rethinkdbdash')(this.datastoreSettings);
        this.storageManager = new RethinkManager(_this);
    }

    this.elasticAdapter = new ElasticAdapter(this);

    this.settings = function() {
        return _this.schema.settings[this.environment];
    };

    this.redisClient = redis.createClient(this.schema.settings[this.environment].redis.url, this.schema.settings[this.environment].redis.options);

    this.isRestResource = function(resource) {
        return !_this.schema.resources[resource].hasOwnProperty('controller') ||
            (_this.schema.resources[resource].hasOwnProperty('controller') &&
             _this.schema.resources[resource].controller.toLowerCase() == 'rest');
    };

    this.restControllers = function() {
        var controllers = [];
        _.each(Object.keys(this.schema.resources), function(resource) {
            if (_this.isResourcePublishable(resource) && _this.isRestResource(resource)) {
                var controller = new RestController(resource, _this.modelHandler(resource), _this.storage, _this);
                controllers.push(controller);
            }
        });
        return controllers;
    };

    this.toSwaggerJson = function() {
        return SchemaToSwagger.format(_this.schema, this.environment);
    };

    this.swaggerDefResponse = function(req, res) {
        res.send(_this.toSwaggerJson());
    };

    this.modelHandler = function(resource) {
        return new SchemaModelHandler(_this.schema.resources[resource].schema);
    };

    // multitenancy related methods

    this.getTenantEntityPlural = function() {
        return pluralize(_this.schema.multitenancy.entity);
    };

    this.getTenantIdField = function() {
        return _this.schema.multitenancy.entity + '_id';
    };

};