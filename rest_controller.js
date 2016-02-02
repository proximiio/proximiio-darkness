var express = require('express');
var router = express.Router();
var pluralize = require('plur');
var fs = require('fs');
var request = require('request');
var capitalize = require('./helpers/capitalize')(); // extends String.prototype
var SchemaHandler = require('./schema_model_handler');
var Organization = require('./organization');
var ElasticAdapter = require('./elastic_adapter');

var DEFAULT_LIMIT = 10;

module.exports = function RestController(resource, schemaModelHandler, datastore, schemaManager) {
    var _this = this;

    this.resource = resource;
    this.plural = pluralize(resource);
    this.tag = ((this.plural) + 'Controller').capitalize();
    this.datastore = datastore;
    this.schemaManager = schemaManager;

    var Model = this.datastore.table(this.plural);
    var elasticAdapter = new ElasticAdapter(schemaManager);

    var elasticPath = function(req, id) {
        return schemaManager.schema.elasticRoot + '/proximi-' + req.organization.id + '/' + pluralize(resource) + '/' + id;
    };

    this.elasticPath = schemaManager.elasticRoot + '/core/' + resource + '/';

    var hasExtensions = function(callback) {
        var fileName = __dirname + '/extensions/' + pluralize(resource).capitalize() + 'Controller.js';
        fs.access(fileName, fs.F_OK, function(error) {
            callback(error, fileName);
        });
    };

    hasExtensions(function(error, fileName) {
        if (error) {
        } else {
            console.log('loading extensions from path:', fileName);
            var Extension = require(fileName);
            _this.extensions = new Extension(resource, _this);
        }
    });

    var formatOutput = function(data) {
        return JSON.stringify(data);
    };

    var dbErrorHandler = function(res) {
        return function(error) {
            return res.status(500).send(JSON.stringify({error: error.message}));
        }
    };

    var validationError = function(error, res) {
        res.status(400).send(error);
    };

    var ownershipError = function(res) {
        res.status(401).send("Organization does not have access for this entity");
    };

    var validationErrorHandler = function(error, res, callback) {
        if (error) {
            res.status(400).send(error);
        } else {
            callback();
        }
    };

    var authErrorHandler = function(error, res, callback) {
        if (error) {
            return res.status(401).send("Invalid Token");
        } else {
            callback();
        }
    };

    this.index = function(req, res) {
        var limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
        var skip = parseInt(req.query.skip) || 0;
        var order = req.query.order || 'id';
        Model.orderBy({index: order})
             .filter({organization_id: req.consumer.id})
             .skip(skip)
             .limit(limit)
             .run().then(function(result) {
                res.send(formatOutput(result));
             })
             .error(dbErrorHandler(res));
    };

    this.count = function(req, res) {
        Model.count().run().then(function(result) {
            console.log('resource', resource, 'record count:' ,result);
            if (result == null) {
                res.status(404).send("Resource for count Not Found");
            } else {
                res.send(formatOutput({count: result}));
            }
        }).error(dbErrorHandler(res));
    };

    this.show = function(req, res) {
        Model.get(req.params.id).run().then(function(result) {
            if (result == null) {
                res.status(404).send("Resource Not Found");
            } else {
                if (req.organization.validatesOwnership(result)) {
                    res.send(formatOutput(result));
                } else {
                    ownershipError(res);
                }
            }
        }).error(dbErrorHandler(res));
    };

    this.create = function(req, res) {
        var params = req.body;
        if (typeof params['id'] != "undefined") {
            delete params['id'];
        }

        params.organization_id = req.organization.id;
        params.createdAt = new Date().toISOString();
        params.updatedAt = params.createdAt;

        schemaModelHandler.extractAndValidateParams(params, function(err, params) {
            validationErrorHandler(err, res, function() {
                Model.insert(params).run().then(function(result) {
                    params.id = result.generated_keys[0];

                    var extensionsCallback = function(data) {
                        res.send(formatOutput(data));
                        elasticAdapter.update(req.organization.id, data);
                    };

                    if (typeof (_this.extensions) != 'undefined' && _this.extensions.callbackExists('create:after')) {
                        _this.extensions.callback('create:after', req, res, params, extensionsCallback);
                    } else {
                        extensionsCallback(params);
                    }
                }).error(dbErrorHandler(res));
            });
        });
    };

    this.update = function(req, res) {
        var params = req.body;
        params.organization_id = req.organization.id;
        params.updatedAt = (new Date()).toISOString();
        schemaModelHandler.extractAndValidateParams(params, function(err, params) {
            validationErrorHandler(err, res, function() {
                Model.get(params.id).run().then(function(result) {
                    if (req.organization.validatesOwnership(result)) {
                        Model.get(params.id).update(params).then(function(saveResult) {
                            Model.get(params.id).run().then(function(updated) {
                                res.send(formatOutput(updated));
                                elasticAdapter.update(req.organization.id, updated);
                            })
                        }).error(dbErrorHandler(res));
                    } else {
                        ownershipError(res);
                    }
                }).error(dbErrorHandler(res));
            });
        });
    };

    this.upsert = function(req, res) {
        if (req.body.id != null &&
            req.body.id != "null" &&
            req.body.id != "new" &&
            typeof req.body.id != 'undefined') {
            _this.update(req, res);
        } else {
            _this.create(req ,res);
        }
    };

    this.delete = function(req, res) {
        Model.get(req.params.id).run().then(function(result) {
            if (req.organization.validatesOwnership(result)) {
                var instance = new Model(result);
                Model.get(req.params.id).delete().run().then(function(deleteResult) {
                    result.isDeleted = true;
                    res.send(formatOutput(result));
                    elasticAdapter.delete(req.params.id, req.organization.id);
                });
            } else {
                ownershipErrorHandle(res);
            }
        }).error(dbErrorHandler());
    };

    router.get('/' + this.plural, this.index);
    router.get('/' + this.plural + '/count', this.count);
    router.get('/' + this.plural + '/:id', this.show);
    router.post('/' + this.plural, this.create);
    router.put('/' + this.plural, this.upsert);
    router.put('/' + this.plural + '/:id', this.update);
    router.delete('/' + this.plural + '/:id', this.delete);

    this.router = router;

    return this;

};