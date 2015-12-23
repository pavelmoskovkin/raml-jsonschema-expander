'use strict';

var path = require('path');
var LocalStorage = require('./lib/storages/LocalStorage');
var WebStorage = require('./lib/storages/WebStorage');

var storages = [];
var localPaths = process.env.SCHEMA_LOCAL_PATHS;
if (localPaths) {
    localPaths = localPaths.split(';');
    for (var i = 0; i < localPaths.length; ++i) {
        var localPath = localPaths[i];
        if (localPath) {
            storages.push(new LocalStorage(localPath));
        }
    }
}
storages.push(new WebStorage());

var expandedSchemaCache = {};

function expandJsonSchemas(ramlObj) {
    for (var schemaIndex in ramlObj.schemas) {
        var schema = ramlObj.schemas[schemaIndex];
        var objectKey = Object.keys(schema)[0];
        var schemaText = expandSchema(schema[objectKey], storages);
        schema[objectKey] = schemaText;
    }

    for (var resourceIndex in ramlObj.resources) {
        var resource = ramlObj.resources[resourceIndex];
        ramlObj.resources[resourceIndex] = fixSchemaNodes(resource);
    }

    return ramlObj;
}

/**
 *  Walk through the hierarchy provided and replace schema nodes with expanded schema.
 */
function fixSchemaNodes(node) {
    var keys = Object.keys(node);
    for (var keyIndex in keys) {
        var key = keys[keyIndex];
        var value = node[key];
        if (key === "schema" && isJsonSchema(value)) {
            var schemaObj = JSON.parse(value);
            if (schemaObj.id && schemaObj.id in expandedSchemaCache) {
                var data = expandedSchemaCache[schemaObj.id];
            } else {
                data = JSON.parse(expandSchema(value, storages));
            }
            node[key] = JSON.stringify(data, null, 2);
        } else if (isObject(value)) {
            node[key] = fixSchemaNodes(value);
        } else if (isArray(value)) {
            node[key] = fixSchemaNodesInArray(value);
        }
    }
    return node;
}

function fixSchemaNodesInArray(value) {
    for (var i in value) {
        var element = value[i];
        if (isObject(element)) {
            value[i] = fixSchemaNodes(element);
        }
    }
    return value;
}

function makeContext(schemaObject, storages, usedStorageIndex, sourcePath) {
    var currentPath = schemaObject.id || sourcePath;
    currentPath = currentPath ? getBasePath(currentPath) : '';
    return {
        storages: usedStorageIndex ? storages.slice(usedStorageIndex) : storages,
        path: currentPath,
        rootNode: schemaObject
    };
}

function expandSchema(schemaText, storages) {
    if (schemaText.indexOf("$ref") > 0 && isJsonSchema(schemaText)) {
        var schemaObject = JSON.parse(schemaText);
        var context = makeContext(schemaObject, storages);
        var expandedSchema = walkTree(context, schemaObject);
        expandedSchemaCache[schemaObject.id] = expandedSchema;
        return JSON.stringify(expandedSchema);
    } else {
        return schemaText;
    }
}

/**
 * Walk the tree hierarchy until a ref is found. Fetch the ref and expand it as well in its place.
 * Return the modified node with the expanded reference.
 */
function walkTree(context, node) {
    var keys = Object.keys(node);
    var expandedRef;
    for (var keyIndex in keys) {
        var key = keys[keyIndex];
        var value = node[key];
        if (key === "$ref") {
            if (value === "#") {
                //Avoid recursively expanding
                return node;
            } else {
                //Node has a ref, create expanded ref in its place.
                expandedRef = fetchRefData(context, value);
                delete node["$ref"];
            }
        } else if (isObject(value)) {
            node[key] = walkTree(context, value);
        } else if (isArray(value)) {
            node[key] = walkArray(context, value);
        }
    }

    //Merge an expanded ref into the node
    if (expandedRef != null) {
        mergeObjects(node, expandedRef);
    }

    return node;
}

function mergeObjects(destination, source) {
    for (var attrname in source) { destination[attrname] = source[attrname]; }
}

function fetchRefData(context, refUri) {
    var uriAndPath = refUri.split('#');
    var fileUri = uriAndPath[0];
    var innerPath = uriAndPath[1];

    if (fileUri) {
        var fullPath = path.join(context.path, fileUri);
        for (var i = 0; i < context.storages.length; ++i) {
            var data = context.storages[i].fetch(fullPath);
            if (!data) {
                data = context.storages[i].fetch(fileUri);
            }

            if (data) {
                var newContext = makeContext(data, context.storages, i, fullPath);
                break;
            }
        }

        if (!data) {
            throw new Error('Ref \'' + fileUri + '\' not found.');
        }
    } else {
        data = context.rootNode;
    }

    if (innerPath) {
        data = getNodeByPath(data, innerPath);
        if (!data) {
            throw new Error('Can\'t resolve path ' + innerPath + ' in ' + fileUri + '.');
        }
    }

    data = walkTree(newContext || context, data);

    return data;
}

function getNodeByPath(node, path) {
    var data = node;
    var parts = path.split('/');
    for (var i in parts) {
        var part = parts[i];
        if (!part) continue;

        if (!data[part]) {
            return null;
        }
        data = data[part];
    }

    return data;
}

function walkArray(context, value) {
    for (var i in value) {
        var element = value[i];
        if (isObject(element)) {
            value[i] = walkTree(context, element);
        }
    }
    return value;
}

function isObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
}

function getBasePath(path) {
    var identityPath = path.split('/');
    identityPath.pop();
    return identityPath.join('/');
}

function isJsonSchema(schemaText) {
    return (schemaText.indexOf("http://json-schema.org/draft-04/schema") > 0);
}

module.exports.expandJsonSchemas = expandJsonSchemas;