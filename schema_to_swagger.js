var _ = require('underscore');
var pluralize = require('plur');
var capitalize = require('./helpers/capitalize')(); // extends String.prototype

module.exports = {
    format: function(appSchema, environment) {

        var getNoIdSchemaForResource = function(resource) {
            var schema = appSchema.resources[resource].schema;
            delete schema.properties["id"];
            return schema;
        };

        var resourceResponses = {};

        var getParametersObjectForAction = function(action, resource) {
            var schema = {
                "description": 'Response',
                "schema": {

                },
                "skipParam": {
                    "name": "skip",
                    "in": "query",
                    "description": "number of items to skip",
                    "required": true,
                    "type": "integer",
                    "format": "int32"
                }
            };
            return schema;
        };

        var getResponseObjectForAction = function(action, resource) {
            var resourceSchema = appSchema.resources[resource].schema;
            var schema = {
                "200": {
                    description: 'Successful response'
                },
                "401": {
                    description: "Unknown Consumer"
                },
                "403": {
                    description: "Api-Key is missing"
                },
                "404": {
                    description: "Not found"
                },
                "500": {
                    description: "Internal server error"
                }
            };

            if (action == 'create' || action == 'update' || action == 'show') {
                schema['200'] = {
                    description: 'Instace of ' + resource + ' returned',
                    schema: {
                        '$ref': appSchema.export.url + appSchema.export.root + '/models/' + resource.capitalize()
                    }
                }
            } else if (action == 'delete') {
                schema['200'] = {
                    description: 'Instace of deleted ' + resource + ' returned',
                    schema: {
                        '$ref': appSchema.export.url + appSchema.export.root + '/models/' + resource.capitalize()
                    }
                }
            } else if (action == 'index') {
                schema['200'] = {
                    description: 'Array of ' + resource + ' instances returned',
                    schema: {
                        type: 'array',
                        items: {
                            "$ref": "https://api.proximi.fi/core_schema/models/" + resource.capitalize()
                        }
                    }
                }
            } else if (action == 'schema') {
                schema['200'] = {
                    description: 'Model schema of ' + resource + ' entity returned',
                    schema: appSchema.resources[resource].schema
                }
            }

            return schema;
        };

        var swagger = {
            swagger: "2.0",
            info: {
                title: appSchema.name,
                version: appSchema.version
            },
            host: appSchema.settings[environment].servers.kong.host,
            basePath: appSchema.basePath,
            schemes: ['https', 'http'],
            consumes: ['application/json'],
            produces: ['application/json'],
            paths: {},
            definitions: {}
        };

        swagger.paths[appSchema.authRoot + "/login"] = {
            post: {
                tags: ["[Auth System]"],
                description: "Login with email and password",
                operationId: 'login',
                parameters: [
                    {name: "email", in: 'formData', type: 'string', 'description': "Email of user", required: true},
                    {name: "password", in: 'formData', type: 'string', 'description': "Password of user", required: true}
                ],
                response: {
                    '200': {
                        description: 'Successful login response'
                    },
                    '401': {
                        description: 'Invalid credentials'
                    },
                    '404': {
                        description: 'User not found'
                    }
                }
            }
        };

        swagger.paths[appSchema.publicRoot + "/registration"] = {
            post: {
                tags: ["[Auth System]"],
                description: "Registration action",
                operationId: 'registration',
                parameters: [
                    {name: "email", in: 'formData', type: 'string', 'description': "Email of user", required: true},
                    {name: "password", in: 'formData', type: 'string', 'description': "Password of user", required: true}
                ],
                response: {
                    '200': {
                        description: 'Successful registration response'
                    },
                    '1011': {
                        description: 'Invalid Email Format'
                    },
                    '1012': {
                        description: 'Email was already registered'
                    }
                }
            }
        };

        _.each(Object.keys(appSchema.resources), function(resource) {
            if (appSchema.resources[resource].publish != false) {
                var resourcePlural = pluralize(resource);
                swagger.paths[appSchema.apiRoot + "/" + resourcePlural + '/{id}'] = {
                    get: {
                        tags: [resource],
                        description: 'Record of ' + resource,
                        operationId: 'show',
                        parameters: [
                            {name: "id", in: 'path', type: 'string', 'description': "Id of " + resource, required: true}
                        ],
                        responses: getResponseObjectForAction('show', resource)
                    },
                    put: {
                        tags: [resource],
                        description: 'Update ' + resource + ' action',
                        operationId: 'update',
                        parameters: [
                            {
                                name: "id",
                                in: 'path',
                                type: 'string',
                                'description': "Id of " + resource + " object to update",
                                required: true
                            },
                            {name: "", in: 'body', schema: appSchema.resources[resource].schema, required: true}
                        ],
                        responses: getResponseObjectForAction('update', resource)
                    },
                    delete: {
                        tags: [resource],
                        description: 'Delete ' + resource + ' action',
                        operationId: 'delete',
                        parameters: [
                            {name: "id", in: 'path', type: 'string', 'description': "Id of " + resource, required: true}
                        ],
                        responses: getResponseObjectForAction('create', resource)
                    }
                };

                swagger.paths[appSchema.apiRoot + '/' + resourcePlural] = {
                    get: {
                        tags: [resource],
                        description: 'Index of ' + pluralize(resource),
                        operationId: 'index',
                        parameters: [
                            {
                                "name": "limit",
                                "in": "query",
                                "description": "Results limit",
                                "default": 10,
                                "type": "number"
                            },
                            {
                                "name": "skip",
                                "in": "query",
                                "description": "Skips records / sets offset",
                                "default": 0,
                                "type": "number"
                            }
                        ],
                        responses: getResponseObjectForAction('index', resource)
                    },
                    post: {
                        tags: [resource],
                        description: 'Create ' + resource + ' action',
                        operationId: 'create',
                        parameters: [
                            {name: "", in: 'body', schema: appSchema.resources[resource].schema, required: true}
                        ],
                        responses: getResponseObjectForAction('create', resource)
                    }
                };

                swagger.paths[appSchema.export.root + '/models/' + resource] = {
                    get: {
                        tags: [resource, '[Model Schemas]'],
                        description: 'Schema of ' + resource + ' entity',
                        operationId: 'schema',
                        parameters: [],
                        responses: getResponseObjectForAction('schema', resource)
                    }
                };

                if (typeof appSchema.resources[resource].customPaths != 'undefined') {
                    for (var path in appSchema.resources[resource].customPaths) {
                        swagger.paths[path] = appSchema.resources[resource].customPaths[path];
                    }
                }
            }
        });

        _.each(Object.keys(appSchema.endpoints), function(endpoint) {
            swagger.paths[endpoint] = appSchema.endpoints[endpoint];
        });

        return swagger;
    }
};