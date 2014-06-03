/**
 * simulator specs
 */
var should = require('should'),
	fs = require('fs'),
	path = require('path'),
	exec = require('child_process').exec,
	simulator = require('../lib/simulator'),
	xcode = require('../lib/xcode'),
	appPath;

describe('simulator', function(){

	function build(flags, done){
		if (typeof(flags)==='function') {
			done = flags;
			flags = [];
		}

		xcode.settings(function(err,settings){
			should(err).not.be.ok;

			var test_project = path.join(__dirname, 'Test'),
				cwd = process.cwd();

			process.chdir(test_project);
			try {
				var cmd = '/usr/bin/xcodebuild clean build -sdk iphonesimulator'+settings.version+' GCC_PREPROCESSOR_DEFINITIONS="'+flags.join(' ')+'"';
				exec(cmd, function(err,stdout,stderr){
					should(stdout).match(/BUILD SUCCEEDED/);
					appPath = path.join(__dirname,'Test','build','Release-iphonesimulator','Test.app');
					fs.existsSync(appPath).should.be.true;
					done(err);
				}); 
			}
			finally {
				process.chdir(cwd);
			}
		});
	}

	it('should be able to launch simulator and log basic logs', function(done){
		this.timeout(30000);
		build(['LOG1=1'],function() {
			var logs = {};
			function logger(label, message) {
				logs[label] = message;
			}
			function callback(err) {
				should(err).not.be.ok;
				should(logs.debug).equal('debug test');
				should(logs.info).equal('info test');
				done();
			}
			var obj = {
				logger: logger,
				build_dir: appPath,
				callback: callback,
				auto_exit: true,
				hide: true
			};
			simulator.launch(obj);
		});
	});

	it('should be able to launch simulator and log ti mocha results', function(done){
		this.timeout(30000);
		build(['LOG2=1'], function() {
			var logs = {};
			function logger(label, message) {
				logs[label] = message;
			}
			function callback(err, result) {
				should(err).not.be.ok;
				should(result).be.ok;
				result.should.be.an.object;
				result.should.have.property('foo','bar');
				Object.keys(logs).should.be.empty;
				done();
			}
			var obj = {
				logger: logger,
				build_dir: appPath,
				callback: callback,
				unit: true,
				hide: true
			};
			simulator.launch(obj);
		});
	});

	it('should be able to launch simulator and log ti mocha results with multiple lines', function(done){
		this.timeout(30000);
		build(['LOG3=1'], function() {
			var logs = {};
			function logger(label, message) {
				logs[label] = message;
			}
			function callback(err, result) {
				should(err).not.be.ok;
				should(result).be.ok;
				result.should.be.an.object;
				result.should.have.property('foo','bar');
				Object.keys(logs).should.be.empty;
				done();
			}
			var obj = {
				logger: logger,
				build_dir: appPath,
				callback: callback,
				unit: true,
				hide: true
			};
			simulator.launch(obj);
		});
	});

});