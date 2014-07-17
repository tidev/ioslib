/**
 * xcode specs
 */
var should = require('should'),
	fs = require('fs'),
	xcode = require('../lib/xcode');

describe("xcode", function(){
	it("should detect xcode", function(done){
		xcode.detect(function(err,xcodePath){
			should(err).not.be.ok;
			should(xcodePath).be.ok;
			should(fs.existsSync(xcodePath)).be.ok;
			done();
		});
	});
	it("should detect xcode settings", function(done){
		xcode.settings(function(err,settings){
			should(err).not.be.ok;
			should(settings).be.ok;
			settings.should.have.property('version');
			['xcodePath','clang','clang_xx','libtool','lipo','otool','simSDKPath','deviceSDKPath'].forEach(function(name){
				settings.should.have.property(name);
				should(fs.existsSync(settings[name])).be.ok;
			});
			done();
		});
	});
	it("should detect system frameworks", function(done){
		xcode.systemFrameworks(function(err,frameworks,dir){
			should(err).not.be.ok;
			should(frameworks).be.ok;
			should(frameworks).be.an.array;
			should(dir).be.ok;
			should(fs.existsSync(dir)).be.ok;
			done();
		});
	});
	it("should detect frameworks from directory", function(done){
		xcode.frameworksFromDir('/System/Library/Frameworks/',function(err,frameworks){
			should(err).not.be.ok;
			should(frameworks).be.ok;
			should(frameworks).be.an.array;
			done();
		});
	});
});