var prettyjson = require('prettyjson');
var colors = require('colors');

var Logger = {
    system: function(tag) {
        var argArray = (arguments.length === 1?[arguments[0]]:Array.apply(null, arguments));
        argArray.shift();
        console.log((new Date() + '').gray, (tag + ': ').white.bold, argArray.join(' '));
    },
    debug: function(tag) {
        // needs further customization, should show only to developers
        var argArray = (arguments.length === 1?[arguments[0]]:Array.apply(null, arguments));
        argArray.shift();
        console.log((new Date() + '').gray, (tag + ': ').white.bold, argArray.join(' '));
    },
    error: function(tag, error) {
        console.error((new Date() + '').gray, (tag + ': ').white.bold, JSON.stringify(error).red.bold);
    }
};

Logger.d = Logger.debug;

module.exports = Logger;