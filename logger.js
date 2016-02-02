var prettyjson = require('prettyjson');

module.exports = {
    system: function(tag) {
        var argArray = (arguments.length === 1?[arguments[0]]:Array.apply(null, arguments));
        argArray.shift();
        console.log((new Date() + '').gray, (tag + ': ').white.bold, argArray.join(' '));
    },
    error: function(tag, error) {
        console.error((new Date() + '').gray, (tag + ': ').white.bold, error);
    }
};