var should = require('should'),
	IOSLog = require('../lib/ioslog'),
	StringReader = require('./stringreader');

function TestStream(name, stdout_log, stderr_log) {
	
	this.logs = {};

	function callback(label,message) {
		if (label in this.logs) {
			this.logs[label].push(message);
		}
		else {
			this.logs[label] = [message];
		}
	}

	var stdout = new StringReader(stdout_log || ''),
		stderr = new StringReader(stderr_log || ''),
		stream = {stdout:stdout, stderr:stderr};

	this.logger = new IOSLog(name, callback.bind(this));
	this.logger.attach(stream);

	stdout.resume();
	stderr.resume();
}

describe('ioslog', function(){

	it("should raise exception if missing name", function(){
		(function(){
  			new TestStream();
		}).should.throw();
	});

	it("should be able to log single string", function(){
		var testStream = new TestStream('name','stdout','stderr');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.error.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout');
		testStream.logs.error[0].should.equal('stderr');
	});

	it("should be able to log single string with new line", function(){
		var testStream = new TestStream('name','stdout\n');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).not.be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout');
	});

	it("should be able to log single string with new line with spaces at end", function(){
		var testStream = new TestStream('name','stdout   ');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).not.be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout   ');
	});

	it("should be able to log single string with new line with tab at end", function(){
		var testStream = new TestStream('name','stdout\t');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).not.be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\t');
	});

	it("should be able to log multiple lines with no line ending", function(){
		var testStream = new TestStream('name','stdout\nstdout');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).not.be.ok;
		testStream.logs.debug.should.have.length(2);
		testStream.logs.debug[0].should.equal('stdout');
		testStream.logs.debug[1].should.equal('stdout');
	});

	it("should be able to log multiple lines with line ending", function(){
		var testStream = new TestStream('name','stdout\nstdout\n');
		should(testStream.logs.debug).be.ok;
		should(testStream.logs.error).not.be.ok;
		testStream.logs.debug.should.have.length(2);
		testStream.logs.debug[0].should.equal('stdout');
		testStream.logs.debug[1].should.equal('stdout');
	});

	it("should be able to log with debug label", function(){
		var testStream = new TestStream('name','[DEBUG] stdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout');
	});

	it("should be able to log with error label", function(){
		var testStream = new TestStream('name','[ERROR] stdout');
		should(testStream.logs.error).be.ok;
		testStream.logs.error.should.have.length(1);
		testStream.logs.error[0].should.equal('stdout');
	});

	it("should be able to log with error label and line breaks", function(){
		var testStream = new TestStream('name','[ERROR] stdout\nstdout');
		should(testStream.logs.error).be.ok;
		testStream.logs.error.should.have.length(1);
		testStream.logs.error[0].should.equal('stdout\nstdout');
	});

	it("should be able to log with debug label and line breaks", function(){
		var testStream = new TestStream('name','[DEBUG] stdout\nstdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\nstdout');
	});

	it("should be able to log with debug label and line breaks and ending newline", function(){
		var testStream = new TestStream('name','[DEBUG] stdout\nstdout\n');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\nstdout');
	});

	it("should be able to log with debug label and line breaks and ending tab", function(){
		var testStream = new TestStream('name','[DEBUG] stdout\nstdout\t');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\nstdout\t');
	});

	it("should be able to log with app name", function(){
		var testStream = new TestStream('name','name[09891:92abc0] stdout\nstdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(2);
		testStream.logs.debug[0].should.equal('stdout');
		testStream.logs.debug[1].should.equal('stdout');
	});

	it("should be able to log with app name and debug label and line breaks and ending tab", function(){
		var testStream = new TestStream('name','name[09891:92abc0] [DEBUG] stdout\nstdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\nstdout');
	});

	it("should be able to log with junk before app name and debug label and line breaks and ending tab", function(){
		var testStream = new TestStream('name','foo name[09891:92abc0] [DEBUG] stdout\nstdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout\nstdout');
	});

	it("should be able to log with junk before app name and debug label and single line with no line ending", function(){
		var testStream = new TestStream('name','foo name[09891:92abc0] [DEBUG] stdout');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout');
	});

	it("should be able to log before app name and debug label and single line with line ending", function(){
		var testStream = new TestStream('name','name[09891:92abc0] [DEBUG] stdout\n');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(1);
		testStream.logs.debug[0].should.equal('stdout');
	});

	it("should be able to log with new lines and embedded tabs", function(){
		var testStream = new TestStream('name','name[09891:92abc0] [ERROR] stdout\n\tline1\n\tline2');
		should(testStream.logs.error).be.ok;
		testStream.logs.error.should.have.length(1);
		testStream.logs.error[0].should.equal('stdout\n\tline1\n\tline2');
	});

	it("should be able to log separate lines", function(){
		var testStream = new TestStream('name','[DEBUG] line1\n[DEBUG] line2\n');
		should(testStream.logs.debug).be.ok;
		testStream.logs.debug.should.have.length(2);
		testStream.logs.debug[0].should.equal('line1');
		testStream.logs.debug[1].should.equal('line2');
	});

});