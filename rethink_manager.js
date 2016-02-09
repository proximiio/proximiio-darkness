"use strict";
var _ = require('underscore');
var pluralize = require('plur');
var colors = require('colors');
var DatabaseDoesNotExistError = require('./errors/databaseDoesNotExist');
var Log = require('./logger');

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

    this.createIndexes = function(table) {
        var resource = _this.resourceMap[table];
        var indexesToCreate;
        if (typeof appSchema.resources[resource].schema.indexes != 'undefined') {
            indexesToCreate = appSchema.resources[resource].schema.indexes.slice();
        } else {
            indexesToCreate = [];
        }

        let createIndex = (index) => {
            log('index ', index.yellow.bold, 'does not exist, creating...');
            return datastore.table(table)
                            .indexCreate(index)
                            .run()
                            .then((result) => {
                                log('index ' + table.green.bold + '/' + index.yellow.bold + ' created');
                            })
        };

        var createIndexPromises = [];

        let reduceByExisting = (indexes) => {
            indexes.forEach((index) => {
                if (_.contains(indexesToCreate, index)) {
                    indexesToCreate = _.without(indexesToCreate, index);
                }
            });
            return indexesToCreate;
        };

        let generateCreateIndexPromises = (indexes) => {
            indexes.forEach((index) => {
                createIndexPromises.push(createIndex(index));
            });
        };

        return datastore.table(table)
                        .indexList().run()
                        .then(reduceByExisting)
                        .then(generateCreateIndexPromises)
                        .all(createIndexPromises);
    };

    this.checkTables = function(databaseExists) {
        var tablesToCreate = Object.keys(_this.resourceMap);

        let getTablesToCreate = (tables) => {
            tables.forEach((table) => {
                if (_.contains(tablesToCreate, table)) {
                    tablesToCreate = _.without(tablesToCreate, table);
                }
            });
            return tablesToCreate;
        };

        let createTable = (table) => {
            return datastore.tableCreate(table).run()
                            .then((result) => {
                                log('table ' + table.green.bold + ' created');

                                _this.createIndexes(table, function() {
                                    if (tablesToCreate.length > 0) {
                                        createNextTable();
                                    } else {
                                        callback();
                                    }
                                });
                            });
        };

        let createTablePromises = [];

        let generateCreateTablePromises = (tables) => {
            tables.forEach((table) => {
                createTablePromises.push(createTable(table));
            });
            return createTablePromises;
        };

        return datastore.tableList().run()
                        .then(getTablesToCreate)
                        .then(generateCreateTablePromises)
                        .all(createTablePromises);
    };

    this.checkDatabase = function() {
        let containsDatabase = (databases) => {
            return _.contains(databases, schemaManager.settings().datastore.db);
        };

        return datastore.dbList().run()
                        .then(containsDatabase)
                        .then((databaseExists) => {
                           if (!databaseExists) {
                               var error = new DatabaseDoesNotExistError();
                               throw(error);
                           }
                           return databaseExists;
                        })
                        .then(_this.checkTables)
    };

    this.ensureReady = function() {

        return _this.checkDatabase()
                    .then(_this.checkTables);
    };

    var log = function(msg) {
        Log.d(_this.tag, msg);
    };

};