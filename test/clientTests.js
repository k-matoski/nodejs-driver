var async = require('async');
var util = require('util');
var Client = require('../index.js').Client;
var types = require('../lib/types.js');
var keyspace = new types.QueryLiteral('unittestkp1_2');

var client = null;

module.exports = {
  'setup keyspace': function(test) {
    client = new Client({hosts: ['localhost:9042', 'localhost:9042']});
    client.execute("DROP KEYSPACE ?;", [keyspace], function () {
      client.execute("CREATE KEYSPACE ? WITH replication = {'class': 'SimpleStrategy','replication_factor': '1'};", [keyspace], function (err) {
        if (err) {
          test.fail(err);
          test.done();
          return;
        }
        client.execute("USE ?;", [keyspace], function (err) {
          if (err) test.fail(err);
          test.done();
        });
      });
    });
  },
  'execute params': function (test) {
    async.series([
      function (callback) {
        //all params
        client.execute('SELECT * FROM system.schema_keyspaces', [], types.consistencies.one, function(err){
          callback(err);
        });
      },
      function (callback) {
        //no consistency specified
        client.execute('SELECT * FROM system.schema_keyspaces', [], function(err){
          callback(err);
        });
      },
      function (callback) {
        //change the meaning of the second parameter to consistency
        client.execute('SELECT * FROM system.schema_keyspaces', types.consistencies.one, function(err){
          callback(err);
        });
      },
      function (callback) {
        //query params but no params args, consistency specified, must fail
        client.execute('SELECT * FROM system.schema_keyspaces keyspace_name = ?', types.consistencies.one, function(err){
          if (!err) {
            callback(new Error('Consistency should not be treated as query parameters'));
          }
          else {
            callback(null);
          }
        });
      },
      function (callback) {
        //no query params
        client.execute('SELECT * FROM system.schema_keyspaces', function(err) {
          callback(err);
        });
      }
    ],
    //all finished
    function(err){
      test.ok(err === null, err);
      test.done();
    });
  },
  'max execute retries': function (test) {
    //Only 1 retry
    client.options.maxExecuteRetries = 1;
    var isServerUnhealthyOriginal = client.isServerUnhealthy;

    //Change the behaviour so every err is a "server error"
    client.isServerUnhealthy = function (err) {
      return true;
    };

    client.execute('WILL FAIL AND EXECUTE THE METHOD FROM ABOVE', function (err, result, retryCount){
      test.ok(err, 'The execution must fail');
      test.equal(retryCount, client.options.maxExecuteRetries, 'It must retry executing the times specified');
      client.isServerUnhealthy = isServerUnhealthyOriginal;
      test.done();
    });
  },
  'no initial connection callback': function (test) {
    var localClient = new Client({hosts: ['localhost:8080', 'localhost:8080']});
    localClient.on('log', function (type, message) {
      //console.log(type, message);
    });
    localClient.connections[0].on('log', function (type, message) {
      //console.log('con0', type, message);
    });
    var errors = [];
    async.series([function (callback){
      localClient.execute('badabing', function (err) {
        if (err) {
          errors.push(err);
          callback();
        }
      });
    }, function (callback){
      localClient.execute('badabang', function (err) {
        if (err) {
          errors.push(err);
        }
        callback();
      });
    }], function () {
      test.ok(errors.length === 2, 'There wasnt any good connection, it must callback with an err each time trying to execute');
      if (errors.length == 2) {
        test.ok(errors[0].name == 'PoolConnectionError', 'Errors should be of type PoolConnectionError');
      }
      localClient.shutdown(function () {
        test.done();
      });
    });
  },
  'get a connection timeout': function (test) {
    var localClient = new Client({hosts: ['localhost']});
    localClient.on('log', function (type, message) {
      //console.log(type, message);
    });
    //wait for short amount of time
    localClient.options.getAConnectionTimeout = 200;
    //mark all connections as unhealthy
    localClient.isHealthy = function() {
      return false;
    };
    //disallow reconnections
    localClient.canReconnect = localClient.isHealthy;
    localClient.execute('badabing', function (err) {
      test.ok(err, 'Callback must return an error');
      test.ok(err.name === 'TimeoutError', 'The error must be a TimeoutError');
      localClient.shutdown(function() {
        test.done();
      });
    });
  },
  'shutdown': function (test) {
    client.shutdown(function(){
      test.done();
    });
  }
}