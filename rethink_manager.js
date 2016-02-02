var _ = require('underscore');
var pluralize = require('plur');
var colors = require('colors');

module.exports = function RethinkManager(schemaManager) {

    this.tag = 'RethinkManager';
    var _this = this;

    this.schemaManager = schemaManager;
    var appSchema = schemaManager.schema;
    var datastore = schemaManager.storage;

    this.r = datastore;

    this.resourceMap = {};

    _.each(Object.keys(appSchema.resources), function (resource) {
        if (_this.schemaManager.resourceNeedsDatabase(resource)) {
            _this.resourceMap[pluralize(resource)] = resource;
        }
    });

    this.createIndexes = function(table, callback) {
        var resource = this.resourceMap[table];
        var indexesToCreate;
        if (typeof appSchema.resources[resource].schema.indexes != 'undefined') {
            indexesToCreate = appSchema.resources[resource].schema.indexes.slice();
        } else {
            indexesToCreate = [];
        }

        var createNextIndex = function() {
            var index = indexesToCreate[0];
            log('index ', index.yellow.bold, 'does not exist, creating...');
            datastore.table(table).indexCreate(index).run().then(function(result) {
                log('index ' + table.green.bold + '/' + index.yellow.bold + ' created');
                indexesToCreate.shift();
                if (indexesToCreate.length == 0) {
                    callback();
                } else {
                    createNextIndex();
                }
            }).error(callback);
        };

        datastore.table(table).indexList().run().then(function(indexes) {
            _.each(indexes, function(index) {
               if (_.contains(indexesToCreate, index)) {
                   indexesToCreate = _.without(indexesToCreate, index);
               }
            });
            if (indexesToCreate.length == 0) {
                callback();
            } else {
                createNextIndex();
            }
        }).error(callback);
    };

    this.checkTables = function(callback) {
        var tablesToCreate = Object.keys(this.resourceMap);
        datastore.tableList().run().then(function(tables) {
            _.each(tables, function(table) {
                if (_.contains(tablesToCreate, table)) {
                    tablesToCreate = _.without(tablesToCreate, table);
                }
            });
            if (tablesToCreate.length == 0) {
                callback();
            } else {
                createNextTable();
            }
        }).error(callback);

        var createNextTable = function() {
            var table = tablesToCreate[0];
            log('table ' + table.green.bold + ' does not exist, creating...');
            datastore.tableCreate(table).run().then(function(result) {
                tablesToCreate.shift();
                log('table ' + table.green.bold + ' created');

                _this.createIndexes(table, function() {
                    if (tablesToCreate.length > 0) {
                        createNextTable();
                    } else {
                        callback();
                    }
                });
            }).error(callback);
        };

    };

    this.checkDatabase = function(callback) {
        datastore.dbList().run().then(function(databases) {
            callback(null, _.contains(databases, schemaManager.settings().datastore.db));
        }).error(callback);
    };

    this.ensureReady = function(callback) {

        this.checkDatabase(function(err, exists) {
            if (err) {
                callback(err);
            } else {
                _this.checkTables(callback);
            }
        });
    };

    var log = function(msg) {
        console.log((new Date() + '').gray, 'RethinkManager: '.white.bold, msg);
    };


};