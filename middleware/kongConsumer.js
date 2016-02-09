var Organization = require('../tenant');
var Log = require('../logger');

/**
 * Kong Consumer Middleware
 * constructs consumer object from kong headers and assigns it to request object
 *
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var KongConsumer = function() {
    return function(req, res, next) {
        if (req.isWhitelisted) {
            next();
        } else {
            if (req.headers.hasOwnProperty('x-consumer-id') &&
                req.headers.hasOwnProperty('x-consumer-custom-id')) {
                req.consumer = {
                    id: req.headers['x-consumer-custom-id'],
                    consumerId: req.headers['x-consumer-id'],
                    name: req.headers['x-consumer-name'],
                    token: req.headers['authorization'].replace('Bearer ', '')
                };
                next();
            } else {
                res.status(401).send("Unknown Consumer");
            }
        }
    }
};

module.exports = KongConsumer;