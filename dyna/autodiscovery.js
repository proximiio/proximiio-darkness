"use strict";

var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();
var Dyna = require('./controller');
var Promise = require('bluebird');

var DynaAutodiscovery = function(schemaManager) {
    let _this = this;


    let getDirectories = function(srcpath) {
        try {
            fs.accessSync(srcpath, fs.F_OK);
            return fs.readdirSync(srcpath).filter(function(file) {
                return fs.statSync([srcpath, file].join('')).isDirectory();
            });
        } catch (e) {
            return [];
        }

    };

    let dynas = getDirectories(process.cwd() + '/extensions/dyna/');

    let endpointPromises = [];

    dynas.forEach((endPoint) => {
        endpointPromises.push(Dyna(endPoint, schemaManager));
    });

    return Promise.all(endpointPromises);
};

module.exports = DynaAutodiscovery;