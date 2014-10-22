var 
  exec = require('child_process').exec,
  async = require('async'),
  path = require('path'),
  appc = require('node-appc'),
  fs = require('fs'),
  bplistParse = require('bplist-parser'),
  Tail = require('tail').Tail,
  spawn = require('child_process').spawn,
  _ = require("underscore");

var 
  VERSION = '0.1',
  simulatorInstance = null,
  developerDir = null,
  verbose = false,
  timeout = -1;

// Finds the developer directory using xcode-select
function FindDeveloperDir(callback) {
  exec("/usr/bin/xcode-select -print-path", function(error, stdout, stderr) {
    var output = stdout.replace(/(\r\n|\n|\r)/gm,"");
    if(output.length==0) output = null;
    callback(output);
  });
}

// Finds the sdks using xcodebuild -showsdks
function showSDKs(callback) {
  exec("xcodebuild -showsdks", function(error, stdout, stderr) {
    var output = stdout.replace(/(\r\n|\n|\r)/gm,"");
    console.log("Available iOS SDK's");
    output.split('iOS Simulator SDKs:\t')[1].split('\t').forEach(function(val) {
      if (val.indexOf('Simulator - ')>-1) console.log("[DEBUG]",val.split('Simulator - ')[1]);
    });
    callback();
  });
}

function showAllSimulators(callback) {
  getAllDevices(function(devices) {
    console.log("Available Simulators");
    console.log(JSON.stringify(devices, null, "\t"));
    callback();
  });
}

function getAllDevices(callback) {
  exec("xcrun simctl list devices", function(error, stdout, stderr) {
    if (error) {
      console.error('[ERROR]', 'Could not list devices', error); 
      return;
    }
    var deviceSecRe = /-- iOS (.+) --(\n .+)*/mg;
    var matches = [];
    var devices = {};
    var match = deviceSecRe.exec(stdout);

    while (match !== null) {
      matches.push(match);
      match = deviceSecRe.exec(stdout);
    }

    if (matches.length < 1) {
      console.error('[ERROR]', 'Could not find device section', error); 
      return;
    }

    _.each(matches, function (match) {
      var sdk = match[1];
      devices[sdk] = [];
      _.each(match[0].split("\n").slice(1), function (line) {
        var lineRe = /^ (.+) \((.+)\) \((.+)\)/;
        var match = lineRe.exec(line);

        if (match === null) {
          console.error('[ERROR]', 'Could not match line', error); 
          return;
        }
        
        var device = {};
        device.name = match[1];
        device.udid = match[2];
        device.state = match[3];
        devices[sdk].push(device);
      });
    });
    callback(devices);
  });
}

function getPlistData(file) {
  var data;
  if (fs.existsSync(file)) {
    var fileData = fs.readFileSync(file);
    try {
      data = bplistParse.parseBuffer(fileData)[0];
    } catch (err) {
      if (err.message.indexOf("Invalid binary plist") !== -1) {
        data = xmlplist(file)[0];
      } else {
        throw err;
      }
    }
  } else {
    console.error('[ERROR]', 'Settings file ' + file + ' did not exist');
    process.exit(1);
  }
  return data;
}

function launchSimulator(udid, callback) {
  // Get list of devices available
  getAllDevices(function(devices) {
    var deviceToLaunch = null;

    Object.keys(devices).forEach(function(sdk) {
      devices[sdk].forEach(function(simulatorDevice) {
        if (simulatorDevice.udid != udid && simulatorDevice.state == 'Booted') {
          console.error("[ERROR]", "Device in invalid state");
          process.exit(1);
        }
        if (simulatorDevice.udid == udid) deviceToLaunch = simulatorDevice;
      });
    });

    if (deviceToLaunch.uuid=='undefined') {
      console.error('[ERROR]', 'Device not found');
      process.exit(1);
    }

    var iosSimPath = path.resolve(developerDir, "Applications/iOS Simulator.app/Contents/MacOS/iOS Simulator");
    simulatorInstance = spawn(iosSimPath,['--args', '-CurrentDeviceUDID', deviceToLaunch.udid]);
    if (verbose) {
      console.log("[DEBUG]", 'Launching Simulator');
    }

    callback(); // Simulator has launched
  });
}

function closeSimulator() {
  if (simulatorInstance != null) {
    simulatorInstance.kill();
  }
  process.exit();
}

function installApp(appPath, udid, callback) {
  exec("xcrun simctl install "+udid+" "+appPath, function(err, stdout, stderr){
    if (!err) {
      console.log("[INFO]", "App Installed");
      callback();
    } else if(err.code == '146'){ //Invalid Device State (Waiting for boot)
      setTimeout(function() {
        installApp(appPath, udid, callback);
      },3000);
    } else {
      console.log("[INFO]", err);
    }
  });
}

function launchAppInSimulator(udid, CFBundleIdentifier, callback) {
  exec("xcrun simctl launch "+udid+" "+CFBundleIdentifier, function(error, stdout, stderr){
    if (error==null) {
      if (verbose) {
        console.log("[DEBUG]",'Launching App');
      }
      callback();
    } else if(error.code==4) {
      console.error("[ERROR]", "Application not found on device");
    } else if(error.code == '146'){  //Invalid Device State (Waiting for boot)
      setTimeout(function(){
        launchAppInSimulator(udid, CFBundleIdentifier, callback);
      },3000);
    } else if(error.code == '145') {
      console.error("[ERROR]", "Device not found");
    } else {
      console.error("[ERROR]", error);
    }
  });
}

function launch(udid, options) {
  var 
    CFBundleIdentifier = options.CFBundleIdentifier,
    logPath=null,
    tail=null;

  async.series([
    function(next) {
      launchSimulator(udid,next);
    },
    function(next) {
      if(CFBundleIdentifier==null && options.appPath!=null){
        CFBundleIdentifier = getPlistData(options.appPath+'/info.plist').CFBundleIdentifier;
        installApp(options.appPath, udid, next);
      } else next();
    },
    function(next) {
      if(CFBundleIdentifier!=null){
        logPath = appc.fs.resolvePath("~/Library/Logs/CoreSimulator/"+udid+"/system.log");

        launchAppInSimulator(udid, CFBundleIdentifier, function() {
          tail = new Tail(logPath);
          tail.on("line", function(data) {
            console.log('[LOG]', data.trim());
          });

          setTimeout(function(){
            console.log('[TEST]','AUTO_EXIT');
          }, 500);
        });
      }
    }
  ]);
}

function runWithArgv(argv) {
  argv.splice(0,1); // remove node from argv
  var argc = argv.length;

  if (argc < 2) {
    //[self printUsage];
    return;
  }

  async.series([
    function(next) {
      // Get Developer Directory
      FindDeveloperDir(function(dir){
        developerDir = dir;
        if (developerDir == null) {
          console.error("Unable to find developer directory.");
          process.exit(1);
        } else next();
      });
    }, function(next) {
      // Check for non simulator argv
      if (argv[1] == "showsdks") {
        showSDKs(function(){
          process.exit(0);
        });
      } else if (argv[1] == "showallsimulators") {
        showAllSimulators(function(){
          process.exit(0);
        });
      } else next();
    }, function(next) {
      // check for flags
      var 
        appPath = null,
        CFBundleIdentifier = null,
        launchFlag = argv[1] == 'launch',
        startOnly = argv[1] == 'start',
        udid = null,
        i = 0;

        if (startOnly) i = 2;
        else if (argc > 2) {
          if (argv[2] == '--cfbundleidentifier') {
            i = 4;
            CFBundleIdentifier = argv[3];
          } else {
            i = 3;
            appPath = path.resolve(argv[2]);
          }
        }

      if (launchFlag || startOnly) {
        if (launchFlag && argc < 3) {
          console.error("Missing application path argument");
          //[self printUsage];
          process.exit(0);
        }

        // loop through flags
        for (; i < argc; i++) {
          if (argv[i] == '--version') {
            console.log(VERSION);
            return;
          } else if (argv[i] == '--verbose') {
            verbose = true;
          } else if (argv[i] == '--xcode-dir') {
            i++;
            developerDir = argv[i];
          } else if (argv[i] == '--udid') {
            i++;
            udid = argv[i];
          } else if (argv[i] == '--timeout') {
            i++;
            timeout = argv[i];
          } else {
            console.error("[ERROR]", "unrecognized argument:", argv[i]);
            //[self printUsage];
            process.exit(0);
          }
        }

        // launch app
        launch(udid, {
          appPath: appPath,
          CFBundleIdentifier: CFBundleIdentifier
        });

      } else process.exit(0);
    }
  ]);
}

// This allows the process to continue after a close request
process.stdin.resume();

process.on('exit', closeSimulator);
process.on('SIGINT',  closeSimulator);

runWithArgv(process.argv);