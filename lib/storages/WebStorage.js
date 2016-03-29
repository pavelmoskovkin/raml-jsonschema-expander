'use strict';

var urllibSync = require('urllib-sync');

function WebStorage() {
    this.cache = {};
}

WebStorage.prototype.fetch = function fetch(uri) {
    if (uri in this.cache) {
        return this.cache[uri];
    }

    try {
        var data = urllibSync.request(uri, { timeout: 30000 });
    } catch (e) {
        throw new Error('Can\'t get file by uri: ' + uri);
    }

    if (!data) return null;

    var result = JSON.parse(data);
    this.cache[uri] = result;
    return result;
};

WebStorage.prototype.getStorageName = function getStorageName() {
    return 'Web';
};

module.exports = WebStorage;
