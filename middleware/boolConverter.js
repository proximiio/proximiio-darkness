/**
 * ContentTypeManager cares about proper response Content-Type header
 *
 * @returns {Function} - Express Middleware Function
 * @constructor
 */
var BoolConverter = function() {
    return function(req, res, next) {
        if (typeof req.body["_boolConvert"] != "undefined") {
          for (var attribute in req.body["_boolConvert"]) {
            var value = req.body["_boolConvert"][attribute];
            req.body[attribute] = value == 1 ? true : false;
            console.log('converted bool attribute:', attribute);
          }
          delete req.body["_boolConvert"];
        }
        next();
    }
};

module.exports = BoolConverter;
