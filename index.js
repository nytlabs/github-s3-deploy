/*
 *   GitHub to S3 Pusher: an AWS Lambda function, triggered by Github Webhook via SNS, to
 *   sync changes on commit to an S3 bucket.
 *
 *   Author: Matt Boggie, New York Times R&D Lab
 *   Copyright: The New York Times Company
 *   Version: 0.01, November 2015   
 */

// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var fs = require('fs');
var archive = require('github-archive-stream');

var token = process.env['GIT_TOKEN'];
// var decrypted;

// get reference to S3 client 
var s3client = new AWS.S3();
var s3bucket = process.env.S3_BUCKET;

// This handler is called by the AWS Lambda controller when a new SNS message arrives.
exports.handler = function(event, context) {
  // if (decrypted) {
    processEvent(event, context);
  // } else {
  //   // Decrypt code should run once and variables stored outside of the function
  //   // handler so that these are decrypted once per container
  //   const kms = new AWS.KMS();
  //   kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
  //     if (err) {
  //       console.log('Decrypt error:', err);
  //       return callback(err);
  //     }
  //     decrypted = data.Plaintext.toString('ascii');
  //     processEvent(event, context);
  //   });
  // }
};

function processEvent(event, context) {
  // get the incoming message
  var githubEvent = event.Records[0].Sns.Message;
  var mesgattr = event.Records[0].Sns.MessageAttributes;

  if ((mesgattr.hasOwnProperty('X-Github-Event')) && (mesgattr['X-Github-Event'].Value == "pull_request")) {
    var eventObj = JSON.parse(githubEvent);
    if (eventObj.action == "opened") {
      console.log(eventObj);
      var re = new RegExp(/([^\/]*)/);
      var found = re.exec(eventObj.repository.full_name);
      var user = found[0];
      var repo = eventObj.repository.full_name;
      var sha = eventObj.pull_request.head.sha;

      console.log("DEFINITELY Got a pull request opened. Will get code from: ", repo);

      if (!token){
        context.fail("Couldn't retrieve github token. Exiting.");
      } else {

        var archiveOpts = {
          "auth": {
            "user": user,
            "token": token
          },
          "repo": repo,
          "ref": sha
        };
        var output = archive(archiveOpts).
          pipe(fs.createWriteStream('/tmp/' + sha + '.tar.gz'));

        fs.readdir("/tmp", (err, files) => {
          files.forEach(file => {
            console.log(file);
          });
        });

        s3put(output.path);
      }       //end token else
    }         //end if opened message
    else {
      console.log("Message was not a github pull request open. Exiting.");
      console.log(githubEvent);
      console.log(mesgattr);
      console.log(mesgattr['X-Github-Event'].Value);
      console.log(eventObj.action);
      context.succeed();
    }
  }
  else {
    console.log("Message was not a github pull request. Exiting.");
    console.log(githubEvent);
    console.log(mesgattr);
    console.log(mesgattr['X-Github-Event'].Value);
    console.log(eventObj.action);
    context.succeed();
  }
}; //end index handler

function s3put(filename){
  console.log("Storing " + filename);

  async.waterfall([
    function store(callback){
      var file = fs.createReadStream(filename);
      file.on('error', function (err) {
        if (err) { throw err; }
      });  
      file.on('open', function () {
        console.log("putting " + filename);
        var putparams = { Bucket: s3bucket, Key: filename, Body: file};
        console.log(putparams);

        s3client.putObject(putparams, callback);
      });
    }
  ],  function done(err){
    if (err){
      console.log("Couldn't store " + filename + " in bucket " + s3bucket + "; " + err);
    }
    else {
      console.log("Saved " + filename + " to " + s3bucket + " successfully.");
    }
  }
  );
}
