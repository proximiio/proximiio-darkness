var Organization = require('../organization');

module.exports = function OrganizationAuthorizer(options) {
    return function(req, res, next) {
        if (req.isWhitelisted) {
            next();
        } else {
            Organization.initFromConsumer(req.consumer, options.datastore, function(error, organization) {
                if (error) {
                    res.status(500).send(error);
                } else {
                    // organization is found by consumer token, should validate read/write access
                    if (organization == null) {
                        res.status(401).send("Organization not found");
                    } else {
                        var callback = function (authorized) {
                            if (authorized) {
                                req.organization = organization;
                                next();
                            } else {
                                res.status(401).send("Token not authorized");
                            }
                        };

                        if (req.method == 'GET') {
                            organization.validateReadToken(req.apiKey, callback);
                        } else {
                            organization.validateWriteToken(req.apiKey, callback);
                        }
                    }
                }
            });
        }
    }
};