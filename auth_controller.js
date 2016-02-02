var express = require('express');
var router = express.Router();
var Organization = require('./organization');
var bcrypt = require('bcrypt');

module.exports = function RestController(schemaManager) {

    this.authRoot = schemaManager.schema.authRoot;

    var login = function(req, res) {
        var email = req.body.email;
        var password = req.body.password;
        var hashed = bcrypt.hashSync(password, appSchema.auth.salt);
        schemaManager.storage.table('users').filter({email: email, password: hashed}).run().then(function(results) {
            if (results.length == 0) {
                res.status(404).send({code: 404, message: "User Not Found"});
            } else {
                var user = results[0];
                delete user['password'];
                schemaManager.storage.table('organizations').get(user.organization_id).run().then(function(results) {
                    if (results.length == 0) {
                        res.status(404).send({code: 404, message: "Organization Not Found"});
                    } else {
                        var organization = new Organization(results);
                        delete user['organization_id'];
                        user.organization = organization.public();
                        var apiKey = organization.getWriteToken();
                        var consumerKey = organization.data.consumer_credentials;
                        if (apiKey == null) {
                            res.status(404).send({code: 401, message: "Write Access Not Available"});
                        } else {
                            res.send({
                                "user": user,
                                "auth": {
                                    "api-key": apiKey,
                                    "authorization": consumerKey
                                }
                            });
                        }
                    }
                });
            }
        }).error(function(error) {
            return res.status(500).send(JSON.stringify({error: error.message}));
        });
    };

    var logout = function(req, res) {
        res.send({success: true});
    };

    var currentUser = function(req, res) {
        if (req.headers.hasOwnProperty('core-user')) {
            schemaManager.storage.table('users').get(req.headers['core-user']).run().then(function (results) {
                if (results == null) {
                    res.status(404).send({code: 404, message: "User Not Found"});
                } else {
                    var user = results;
                    delete user['password'];
                    schemaManager.storage.table('organizations').get(user.organization_id).run().then(function (results) {
                        if (results.length == 0) {
                            res.status(404).send({code: 404, message: "Organization Not Found"});
                        } else {
                            console.log('found organization:', results);
                            var organization = new Organization(results);
                            delete user['organization_id'];
                            user.organization = organization.public();
                            var apiKey = organization.getWriteToken();
                            if (apiKey == null) {
                                res.status(404).send({code: 401, message: "Write Access Not Available"});
                            } else {
                                res.send(user);
                            }
                        }
                    });
                }
            }).error(function (error) {
                return res.status(500).send(JSON.stringify({error: error.message}));
            });
        } else {
            res.status(404).send({code: 404, message: "Missing Core-User headers"});
        }
    };

    router.post('/login', login);
    router.post('/logout', logout);
    router.get('/', currentUser);
    this.router = router;

    return this;
};
