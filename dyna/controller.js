var express = require('express');
var router = express.Router();
var _ = require('underscore');
var recursive = require('readdir-recursive-promise');
var DynaMethod = require('./method');
var Log = require('../logger');
var colors = require('colors');
var Promise = require('bluebird');

var DynaController = function(endPoint, schemaManager) {
    "use strict";

    let TAG = 'Dyna';
    let _this = this;
    let dynaPath = process.cwd() + '/extensions/dyna/' + endPoint;

    let log = (mountPath) => {
        Log.d(TAG, 'method '.white + ('/' + endPoint + mountPath).green.bold + ' exposed'.white + '');
    };

    let scanFiles = (files) => {
        var scanned = [];
        if (Array.isArray(files.files) && files.files.length > 0) {
            files.files.forEach((content) => {
                content.parent = files.path;
                scanFiles(content).forEach((subscanned) => {
                    scanned.push(subscanned);
                });
            });
        } else {
            scanned.push(files);
        }
        return scanned;
    };

    let processScan = (scans) => {
        var paths = [];
        scans.forEach((scan) => {
            paths.push(scan.parent + '/' + scan.name);
        });
        return paths;
    };

    let mountFilesToRouter = (paths) => {
        paths.forEach((filePath) => {
            let method = require(filePath);
            let id = method.desc().id;
            var mountPath = '/' + id;
            log(mountPath);
            router.post(mountPath, DynaMethod.hookFactory(endPoint, method));
        });
        return {
            endPoint: endPoint,
            router: router
        };
    };

    return recursive.readdirAsync(dynaPath)
                    .then(scanFiles)
                    .then(processScan)
                    .then(mountFilesToRouter);
};

module.exports = DynaController;