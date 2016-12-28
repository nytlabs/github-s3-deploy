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
var util = require('util');
var fs = require('fs');
var mime = require('mime');
var archive = require('github-archive-stream');

const encrypted = process.env['GIT_TOKEN'];
let decrypted;

// get reference to S3 client 
var s3client = new AWS.S3();
var s3bucket = process.env.S3_BUCKET;

// This handler is called by the AWS Lambda controller when a new SNS message arrives.
exports.handler = function(event, context) {
  if (decrypted) {
    processEvent(event, context);
  } else {
    // Decrypt code should run once and variables stored outside of the function
    // handler so that these are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({ CiphertextBlob: new Buffer(encrypted, 'base64') }, (err, data) => {
      if (err) {
        console.log('Decrypt error:', err);
        return callback(err);
      }
      decrypted = data.Plaintext.toString('ascii');
      processEvent(event, context);
    });
  }
};

function processEvent(event, context) {
  // get the incoming message
  var githubEvent = event.Records[0].Sns.Message;
  var mesgattr = event.Records[0].Sns.MessageAttributes;

  if ((mesgattr.hasOwnProperty('X-Github-Event')) && (mesgattr['X-Github-Event'].Value == "pull_request") && (githubEvent['action'] == "opened")) {
    var eventObj = JSON.parse(githubEvent);
    var re = new RegExp(/([^\/]*)/);
    var found = re.exec(eventObj.repository.full_name);
    var user = found[0];
    var repo = eventObj.repository.name;
    var sha = eventObj.head.sha;
    var repostring = "/repos/"+user+"/"+repo+"/commits/"+sha

    console.log("DEFINITELY Got a pull request opened. Will get code from: ", repostring);

    if (!decrypted){
      context.fail("Couldn't retrieve github token. Exiting.");
    } else {

      var archiveOpts = {
        "auth": {
          "user": user,
          "token": decrypted
        }
        "repo": repo,
        "ref": sha
      };
      var archive = archive(archiveOpts).
        pipe(fs.createWriteStream(sha + '.tar.gz'));
      s3put(archive);
    }       //end token else
  }           //end if github message
  else {
    console.log("Message was not a github push message. Exiting.");
    context.succeed();
  }
}; //end index handler

function s3put(file){
  console.log("Storing " + file.filename);

  async.waterfall([
    function store(callback){
      //get contents from returned object
      blob = new Buffer(file.content, 'base64');
      mimetype = mime.lookup(file.filename);
      isText = (mime.charsets.lookup(mimetype) == 'UTF-8');
      if(isText){
        blob = blob.toString('utf-8');
      }
      console.log("putting " + file.filename + " of type " + mimetype);
      var putparams = { Bucket: s3bucket, Key: file.filename, Body: blob, ContentType: mimetype};

      s3client.putObject(putparams, callback);
    }
  ],  function done(err){
    if (err){
      console.log("Couldn't store " + file.filename + " in bucket " + s3bucket + "; " + err);
    }
    else {
      console.log("Saved " + file.filename + " to " + s3bucket + " successfully.");
    }
  }
  );
}
