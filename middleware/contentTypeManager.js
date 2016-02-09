/**
 * ContentTypeManager cares about proper response Content-Type header
 *
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var ContentTypeManager = function() {
    return function(req, res, next) {
        res.setHeader('Content-Type', 'application/json');
        next();
    }
};

module.exports = ContentTypeManager;