#!/usr/bin/env node

var path = require('path'),
    fs = require('fs'),
    readInstalled = require("read-installed"),
    osenv = require('osenv'),
    npmconf = require('npmconf'),
    parse = require('url').parse;

var ostemp = osenv.tmpdir();
var oshome = osenv.home();
var regHost = undefined;

var cwd = process.cwd(),
    cache = findCache(),
    tmp = findTmp();

function findCache () {
  return process.platform === "win32"
            ? path.resolve(process.env.APPDATA || oshome || ostemp, "npm-cache")
            : path.resolve( oshome || ostemp, ".npm");
}

function findTmp () {
  return process.platform === "win32"
            ? path.resolve(ostemp, "npm-cache")
            : path.resolve("/tmp", ".npm");
}

function relock () {
  var packages = {};
  npmconf.load(function (err, conf) {
    if (err) {
      throw err;
    }
    regHost = parse(conf.get('registry')).host;
    readInstalled(cwd, void 0, function (er, data) {
      if (er) throw er;
      //console.log(data);
      if (data.dependencies) {
        Object.keys(data.dependencies).forEach(function (key) {
          walk(data.dependencies[key], packages);
        });
      }
      fs.writeFile(path.join(cwd, 'lockdown.json'), JSON.stringify(sortObj(packages), null, '  ') + '\n');
    });
  });
}

// we take advantage of the way JSON.stringify() is implemented to
// write sorted lockdown.json files for better diffs.
function sortObj(obj) {
  if (typeof obj === 'object' && obj !== null) {
    var sorted = {};
    Object.keys(obj).sort().forEach(function(k) {
      sorted[k] = sortObj(obj[k]);
    });
    return sorted;
  } else if (Array.isArray(obj)) {
    return obj.sort().map(sortObj);
  }
  return obj;
}

function walk (data, packages) {
  var name, version, shasum;
  if (data.name) name = data.name;
  if (data.version) version = data.version;

  if (name) {
    shasum = getShasum(cache, name, version);
    if (!(name in packages)) packages[name] = {};
    packages[name][version] = shasum;
  }

  if (data.dependencies) {
    Object.keys(data.dependencies).forEach(function (key) {
      // ignore bundled dependencies
      if (data.bundleDependencies && data.bundleDependencies.indexOf(key) > -1 ) return;
      walk(data.dependencies[key], packages);
    });
  }
}

function getShasum (cache, name, version) {
  var json = readFirst([
      // cache/name/version/.cache.json
      path.resolve(path.join(cache, name, version, ".cache.json")),
      // cache/name/.cache.json
      path.resolve(path.join(cache, name, ".cache.json")),
      // cache/regHost/name/version/.cache.json
      path.resolve(path.join(cache, regHost, name, version, ".cache.json")),
      // cache/regHost/name/.cache.json
      path.resolve(path.join(cache, regHost, name, ".cache.json")),
      // cache/name/version/package/package.json
      path.resolve(path.join(cache, name, version, "package", "package.json"))
    ]),
    shasum;

  if (!json) {
    console.error("Warning: no cache config for " + name + "@" + version);
    return "*";
  }

  shasum =
    (json.dist && json.dist.shasum) ||
    (json.versions && json.versions[version] && json.versions[version].dist && json.versions[version].dist.shasum) ||
    json._shasum;

  if (!shasum) {
    console.error("Warning: no shasum for " + name + "@" + version);
    return "*";
  }
  return shasum;
}

function readFirst (filePaths) {
  while (filePaths.length) {
    if (fs.existsSync(filePaths[0])) {
      return JSON.parse(fs.readFileSync(filePaths[0]));
    }
    filePaths.shift();
  }
}

exports.relock = relock;

if (fs.realpathSync(process.argv[1]) === fs.realpathSync(__filename)) relock();

