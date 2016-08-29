var fs = require('fs'),
    path = require('path');
    ml = require('minilog');

const electron = require('electron');
const app = electron.app;

var subarg = require('subarg');

var argv = subarg(process.argv.slice(2));
if (argv.v || argv.version) {
  console.log('electron v' + process.versions.electron);
  console.log('chrome v' + process.versions.chrome);
  return app.quit();
}

var runTasks = require('./run-tasks.js');
var log = require('minilog')('electron');

var filter = new ml.Filter();
if (!argv.debug) {
  filter.deny('electron', 'warn');
}
ml.pipe(filter)
  .pipe(ml.defaultFormatter)
  .pipe(ml.defaultBackend);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null;

Object.keys(argv).filter(function(key) { return key !== '_' && key !== 'debug' && !argv[key]._; }).map(function(key) {
  log.debug('Setting Chrome flag: ' + key + ' ' + argv[key]);
  app.commandLine.appendSwitch(key, argv[key].toString());
});

app.on('window-all-closed', function() {
  app.quit();
});

app.on('ready', function() {
  var buffer = '';
  process.stdin.on('data', function(data) {
    buffer += data.toString();
  });
  process.stdin.once('end', function() {
    runTasks(JSON.parse(buffer));
  });
});
