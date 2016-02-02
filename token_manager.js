var jwt = require('jwt-simple');

module.exports = {
    encode: function(payload, secret) {
        return jwt.encode(payload, secret);
    },
    decode: function(token, secret) {
        try {
            return jwt.decode(token, secret);
        } catch(err) {
            return null;
        }

    }
};
