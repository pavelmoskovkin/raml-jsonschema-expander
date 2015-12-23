'use strict';

var fs = require('fs');
var path = require('path');

function LocalStorage(path) {
    this.path = path;
    this.cache = {};
}

LocalStorage.prototype.fetch = function fetch(relativePath) {
    var fullPath = path.join(this.path, relativePath);

    if (fullPath in this.cache) {
        return this.cache[fullPath];
    }

    try {
        var data = fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }

    if (!data) {
        return null;
    }

    var result = JSON.parse(data);
    this.cache[fullPath] = result;
    return result;
};

module.exports = LocalStorage;