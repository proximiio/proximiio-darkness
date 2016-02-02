var Organization = require('../organization');

module.exports = function KongConsumer(options) {
    return function(req, res, next) {
        if (req.isWhitelisted) {
            next();
        } else {
            if (req.headers.hasOwnProperty('x-consumer-id') &&
                req.headers.hasOwnProperty('x-consumer-custom-id')) {
                req.consumer = {
                    id: req.headers['x-consumer-custom-id'],
                    kongId: req.headers['x-consumer-id'],
                    name: req.headers['x-consumer-name']
                };
                next();
            } else {
                res.status(401).send("Unknown Consumer");
            }
        }

    }
};