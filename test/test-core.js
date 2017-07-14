var chai = require("chai");
var rewire = require("rewire");
var assert = chai.assert;
chai.should();
var os = require("os");
var sinon = require("sinon");
var rewire = require("rewire");

describe('Test log-core', function () {

    var core = null;

    describe('Test validateObject', function () {

        before(function () {
            core = require("../cf-nodejs-logging-support-core/log-core.js");
        });

        it('Test equals method: ', function () {
            core.validObject(null).should.equal(false);
            core.validObject(undefined).should.equal(false);
            core.validObject({}).should.equal(false);
            core.validObject("test").should.equal(false);
            core.validObject(1).should.equal(false);
            core.validObject(1.0).should.equal(false);
            core.validObject(0).should.equal(false);
            core.validObject({
                "test": "hallo"
            }).should.equal(true);
        });

        it('Test for cyclic errors: ', function () {
            //cyclic obj test
            var a = {};
            var b = {};
            a.b = b;
            b.a = a;
            core.validObject(a).should.equal(true);
        });

    });

    describe('Test setLoggingLevel', function () {
        it("Test settingLoggingLevel", function () {
            core.setLoggingLevel("error");
            core.getLoggingLevel().should.equal("error");
            core.setLoggingLevel("info");
            core.getLoggingLevel().should.equal("info");
            core.setLoggingLevel("warn");
            core.getLoggingLevel().should.equal("warn");
        });
    });


    describe('Test log output', function () {

        var write;
        var clock;
        var origStdout;
        var output;

        before(function () {
            core = rewire("../cf-nodejs-logging-support-core/log-core.js");
            write = core.__get__("writeLogToConsole");

            origStdout = process.stdout.write;

            core.__set__({
                "stdout": {
                    write: function (data) {
                        output = data;
                    }
                }
            })

            clock = sinon.useFakeTimers();
        });

        after(function () {
            clock.restore();
        });

        afterEach(function () {
            core.setLogPattern(null);
        });

        it("Test log writing in (default) json mode", function () {
            var data = {
                test: "abc"
            };

            write(data);
            output.should.equal(JSON.stringify(data) + os.EOL);
        });

        it("Test  log writing in pattern mode with correct keys", function () {
            var data = {
                text: "abc",
                number: 21,
                obj: {
                    "id": 42
                }
            };

            core.setLogPattern("Test: {{text}} {{number}} {{obj}}");
            write(data)
            output.should.equal('Test: abc 21 ' + JSON.stringify(data.obj) + os.EOL);
        });

        it("Test  log writing in pattern mode with non-existing keys", function () {
            var data = {
                text: "abc",
                number: 21,
                object: {
                    "id": 42
                }
            };

            core.setLogPattern("Test: {{empty}}");

            write(data)
            output.should.equal("Test: {{empty}}" + os.EOL);
        });

        it("Test log writingwith faulty values", function () {
            var data;
            write(data);
            output.should.equal(os.EOL);

            core.setLogPattern(undefined);
            write(data);
            output.should.equal(os.EOL);

            core.setLogPattern("Test: {{empty}}");
            write(data);
            output.should.equal(os.EOL);

            core.setLogPattern("Test: {{empty}}");
            write(null);
            output.should.equal(os.EOL);
        });
    });


    describe('Test sendLog', function () {
        var logLevel;
        var logMeta;
        var sendLog;

        before(function () {
            core = rewire("../cf-nodejs-logging-support-core/log-core.js");
            core.__set__({
                "writeLogToConsole": function (obj) {
                    logMeta = obj;
                    logLevel = obj.level;
                }
            });
            sendLog = core.__get__("sendLog");
        });

        beforeEach(function () {
            logMeta = null;
            core.setLoggingLevel("info");
        })

        it('Test level', function () {
            sendLog("info", {});
            logLevel.should.equal('info');
            sendLog("error", {});
            logLevel.should.equal('error');
        });

        it('Test empty json input', function () {
            sendLog("info", {});
            var output = JSON.stringify(logMeta);
            output.should.equal('{"level":"info"}');
        });

        it("Test correct dumping by level", function () {
            core.setLoggingLevel("error");
            sendLog("info", {});
            assert.isNull(logMeta);
            core.setLoggingLevel("info");
            sendLog("info", {});
            assert.isNotNull(logMeta);

        });

        it('Test simple json input', function () {
            sendLog("info", {
                "field": "value"
            });
            JSON.stringify(logMeta).should.equal('{"field":"value","level":"info"}');
        });

        it('Test complex json output', function () {
            sendLog("info", {
                "field1": "value",
                "field2": 42,
                "field3": 47.11,
                "field4": {
                    "innerField": 73,
                    "innerArray": [{
                        "arrayField1": 1
                    }, {
                        "arrayField2": 2
                    }]
                }
            });
            JSON.stringify(logMeta).should.equal('{"field1":"value","field2":42,"field3":47.11,"field4":{"innerField":73,"innerArray":[{"arrayField1":1},{"arrayField2":2}]},"level":"info"}');
        });
    });

    describe('Test getCorrelationId', function () {
        var logObject = null;
        var getCorrelationId = null;

        before(function () {
            core = rewire("../cf-nodejs-logging-support-core/log-core.js");
            core.__set__({
                "sendLog": function (level, logObj) {
                    logObject = logObj;
                }
            });

            getCorrelationId = core.__get__("getCorrelationId");
        });

        it('Test correct reading from request', function () {
            var testRequest = {};
            testRequest.logObject = {
                "correlation_id": "456"
            };
            testRequest.getCorrelationId = getCorrelationId;
            testRequest.getCorrelationId().should.equal("456");
        });

        it('Test correct handling of missing correlation_id', function () {
            var testRequest = {};
            testRequest.logObject = {};
            testRequest.getCorrelationId = getCorrelationId;
            assert.isNull(testRequest.getCorrelationId());
        });

        it('Test correct handling of missing logObject', function () {
            var testRequest = {};
            testRequest.getCorrelationId = getCorrelationId;
            assert.isNull(testRequest.getCorrelationId());
        });
    });


    describe('Test logMessage', function () {

        var logObject = null;
        var log = null;

        before(function () {
            core = rewire("../cf-nodejs-logging-support-core/log-core.js");
            core.__set__({
                "sendLog": function (level, logObj) {
                    logObject = logObj;
                }
            });

            log = core.__get__("logMessage");
        });

        it("Test simple log", function () {
            log("info", "Test");
            logObject.msg.should.equal("Test");
        });

        it("Test empty log", function () {
            log("info", "");
            logObject.msg.should.equal("");
        });

        it("Test numeric parameter log", function () {
            log("info", "Test %d");
            logObject.msg.should.equal("Test %d");

            log("info", "Test %d", 42);
            logObject.msg.should.equal("Test 42");

            log("info", "Test %d %d", 42, 73);
            logObject.msg.should.equal("Test 42 73");
        });

        it("Test string parameter log", function () {
            log("info", "Test %s");
            logObject.msg.should.equal("Test %s");

            log("info", "Test %s", "abc");
            logObject.msg.should.equal("Test abc");

            log("info", "Test %s %s", "abc", "def");
            logObject.msg.should.equal("Test abc def");
        });

        it("Test json parameter log", function () {
            log("info", "Test %j", {
                "field": "value"
            }, null);
            logObject.msg.should.equal('Test {"field":"value"}');
        });

        it("Test mixed parameter log", function () {
            log("info", "Test %s %d %j", "abc", 42, {
                "field": "value"
            }, null);
            logObject.msg.should.equal('Test abc 42 {"field":"value"}');
        });

        it("Test custom fields log", function () {
            log("info", "Test", {
                "field": "value"
            });

            logObject.msg.should.equal('Test');
            JSON.stringify(logObject.custom_fields).should.equal(JSON.stringify({
                "field": "value"
            }));
        });

        it("Test parameter and custom fields log", function () {
            log("info", "Test %s", "abc", {
                "string": "text",
                "int": 0,
                "obj": {
                    "test": "value"
                }
            });

            logObject.msg.should.equal('Test abc');
            JSON.stringify(logObject.custom_fields).should.equal(JSON.stringify({
                "string": "text",
                "int": "0",
                "obj": "{\"test\":\"value\"}"
            }));
        });

        it("Test logLevel catch", function () {
            assert.isTrue(log("info", "message delivered"));
            assert.isFalse(log("verbose", "message delivered"));
        });

        it("Test correctly bound request id", function () {
            var testRequest = {};
            testRequest.logObject = {
                "request_id": "456"
            };
            testRequest.log = log;
            testRequest.log("info", "Test");
            logObject.msg.should.equal("Test");
            logObject.request_id.should.equal("456");
        });

        it("Test correctly bound correlation id", function () {
            var testRequest = {};
            testRequest.logObject = {
                "correlation_id": "123"
            };
            testRequest.log = log;
            testRequest.log("info", "Test");
            logObject.msg.should.equal("Test");
            logObject.correlation_id.should.equal("123");
        });
    });

    describe('Test initLog', function () {
        var logObject;
        var clock;
        var inherit = {};

        before(function () {
            inherit.VCAP_APPLICATION = process.env.VCAP_APPLICATION;
            inherit.CF_INSTANCE_IP = process.env.CF_INSTANCE_IP;
            process.env.VCAP_APPLICATION = JSON.stringify({
                "application_id": "123456789",
                "application_name": "correct_name",
                "instance_index": "42",
                "space_name": "correct_name",
                "space_id": "123456789",
                "instance_index": "42"
            });
            process.env.CF_INSTANCE_IP = "42";
            core = rewire("../cf-nodejs-logging-support-core/log-core.js");    
            clock = sinon.useFakeTimers();
        });

        beforeEach(function () {
            process.env.VCAP_APPLICATION = JSON.stringify({
                "application_id": "123456789",
                "application_name": "correct_name",
                "instance_index": "42",
                "space_name": "correct_name",
                "space_id": "123456789",
                "instance_index": "42"
            });
            process.env.CF_INSTANCE_IP = "42";
            logObject = null;
        });

        after(function () {
            clock.restore();
        });

        it('Test written_at: ', function () {
            logObject = core.initLog();
            logObject.written_at.should.equal((new Date()).toJSON());

            logObject = core.initLog();
            clock.tick(1);
            logObject.written_at.should.not.equal((new Date()).toJSON());
        });

        it('Test written_ts: ', function () {
            process.hrtime = function () {
                return [12, 14];
            }
            var time = process.hrtime();
            logObject = core.initLog();
            logObject.written_ts.should.equal(time[0] * 1e9 + time[1]);
        });

        // Write values from process.env.VCAP_APPLICATION
        it('Test component_id: ', function () {
            logObject = core.initLog();
            logObject.component_id.should.equal("123456789");
        });

        it('Test component_name: ', function () {
            logObject = core.initLog();
            logObject.component_name.should.equal("correct_name");
        });

        it('Test component_instance: ', function () {
            logObject = core.initLog();
            logObject.component_instance.should.equal("42");
        });

        it('Test space_name: ', function () {
            logObject = core.initLog();
            logObject.space_name.should.equal("correct_name");
        });

        it('Test space_id: ', function () {
            logObject = core.initLog();
            logObject.space_id.should.equal("123456789");
        });

        it('Test source_instance: ', function () {
            logObject = core.initLog();
            logObject.source_instance.should.equal("42");
        });

        it('Test container_id: ', function () {
            logObject = core.initLog();
            logObject.container_id.should.equal("42");
        });


        it('Test default values: ', function () {
            delete process.env.VCAP_APPLICATION;
            delete process.env.CF_INSTANCE_IP;
            //resetting inherit memory for fast init
            var core2 = rewire("../cf-nodejs-logging-support-core/log-core.js");
            core2.__set__("initDummy", null);
            //rewrite process to old values
            //init object
            logObject = core2.initLog();
            //assertions
            logObject.component_id.should.equal("-");
            logObject.component_name.should.equal("-");
            logObject.component_instance.should.equal("0");
            logObject.space_name.should.equal("-");
            logObject.space_id.should.equal("-");
            logObject.source_instance.should.equal("0");
            logObject.container_id.should.equal("-");
        });

        it('Test static values: ', function () {
            logObject = core.initLog();
            logObject.component_type.should.equal("application");
            logObject.layer.should.equal("[NODEJS]");
            logObject.logger.should.equal("nodejs-logger");
        });
    });
});