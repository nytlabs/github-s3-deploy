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
var GitHubApi = require('github');
var mime = require('mime');

var secretfile = "./githubtoken.secret" 
// This should be a file containing the github Personal Access Token, encrypted using AWS-KMS and base 64 decoded.
// See the README for more detail.

var github = new GitHubApi({
    version: '3.0.0',
    debug: false,
    protocol: "https",
    host: "api.github.com"
});

// get reference to S3 client 
var s3client = new AWS.S3();
var s3bucket = "internal.nytlabs.com";
 
exports.handler = function(event, context) {
	// get the incoming message
	var githubEvent = event.Records[0].Sns.Message;
	var mesgattr = event.Records[0].Sns.MessageAttributes;

    if ((mesgattr.hasOwnProperty('X-Github-Event')) && (mesgattr['X-Github-Event'].Value == "push")) {
        var eventObj = JSON.parse(githubEvent);
        var re = new RegExp(/([^\/]*)/);
        var found = re.exec(eventObj.repository.full_name);
        var user = found[0];
        var repo = eventObj.repository.name;
        var sha = eventObj.head_commit.id;
        var repostring = "/repos/"+user+"/"+repo+"/commits/"+sha
        
        console.log("DEFINITELY Got a push message. Will get code from: ", repostring);
        
        // solution borrowed from http://stackoverflow.com/questions/29372278/aws-lambda-how-to-store-secret-to-external-api
        // REFACTOR THIS TO OCCUR OUTSIDE THE HANDLER!

        var encryptedSecret = fs.readFileSync(secretfile);
        var token = null;

        // get key management client for decrypting secrets
        var kms = new AWS.KMS({region:'us-east-1'});
        var params = {
            CiphertextBlob: encryptedSecret
        };
        kms.decrypt(params, function(err, data) {
            if (err) console.log(err, err.stack);
            else {
                token = data['Plaintext'].toString();
            }

            if (!token){
                context.fail("Couldn't retrieve github token. Exiting.");
            }
            else{
                // Authenticate to pull code
        	    github.authenticate({
        	        type: 'oauth',
        	        token: token
        	    });

        	    var gitmsg = {"user": user, "repo": repo, "sha": sha};
        	    github.repos.getCommit({"user": user, "repo": repo, "sha": sha}, function(err, result){
                    console.log("result:", result);
                    if(err) {
                        context.fail("Failed to get commit: ", err);
                    }
                    else
                    {
                        parseCommit(result, user, repo, function(err){
                            if(err) {
                                context.fail("Parsing the commit failed: " + err);
                            }
                            else
                            {
                                console.log("Commit parsed and synced (mostly?) successfully.")
                                context.succeed();
                            }
                        });
                    }
                }); //end github callback
            }       //end token else
        });         //end decrypt callback
    }               //end if github message
    else {
        console.log("Message was not a github push message. Exiting.");
        context.succeed();
    }
}; //end index handler

function parseCommit(resobj, user, repo, callback){
    if((resobj.files) && (resobj.files.length >0)) {

        async.each(resobj.files, function(file, eachcb){
            if(file.status == "removed") {
                s3delete(file.filename, eachcb);
            }
            else {
                if(file.status == "renamed") {
                    async.waterfall([
                        function calldeleter(wfcb) {
                            s3delete(file.previous_filename, wfcb);
                        },
                        function callputter(wfcb) {
                            s3put(file, user, repo, wfcb);
                        }], function done(err) {
                            eachcb(err);
                        });
                }
                else
                {
                    s3put(file, user, repo, eachcb);
                }
            }
        }, function(err){
            console.log("I should be all done now. Here's what error says: ", err)
            callback(err); // 
        });
    }
    else{
        console.log("Commit at " + resobj.html_url + " had no files. Exiting.");
        callback(new Error('No files in commit object'));
    }
}

function s3delete(filename, cb){
    console.log("Deleting ", filename);
    var params = { Bucket: s3bucket, Key: filename };
    
    async.waterfall([
        function callDelete(callback){
            s3client.deleteObject(params, callback);
        }
    ], function done(err){
            if(err) {
                console.log("Couldn't delete " + filename + ": " + err);
            }
            else {
                console.log("Deleted " + filename + " from " + s3bucket);
            }
            cb(); //not passing err here because I don't want to short circuit processing the rest of the array
        }
    );
}

function s3put(file, user, repo, cb){
    console.log("Storing " + file.filename);

    async.waterfall([
        function download(callback){
            //call github for file contents
            console.log("downloading " + file.filename);
            var params = { user: user, repo: repo, sha: file.sha};
            github.gitdata.getBlob(params, callback);
        },
        function store(result, callback){
            //get contents from returned object
            blob = new Buffer(result.content, 'base64');
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
            cb(); //not passing err here because I don't want to short circuit processing the rest of the array
        }
    );
}
