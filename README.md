# Github - S3 Sync
If you have a static web site hosted in an S3 bucket, and you version control that site using Github, this script (and its associated GitHub / AWS configurations) will take new commits to your repo and sync them into your S3 bucket.

## Overview
For new repositories, you should first set up the webooks, SNS queues, etc. before pushing any code. This will take your first commit and move all code into place. For existing repositories / s3 buckets, make sure your repo and your bucket are in sync before continuing.

## Deployment
*Note: special deep abiding thanks to this [AWS Blog post](https://aws.amazon.com/blogs/compute/dynamic-github-actions-with-aws-lambda/), from which these instructions are adapted. I strongly recommend following that post's screenshots if this is unfamiliar territory.*
* Create an SNS Topic on your AWS Console, and save the ARN ID in a safe place for use below.
* Create an IAM User to "publish" as. This is the user that will actually publish into the SNS Topic above. Save the credentials, then edit the user's permissions to create a custom inline policy as follows:

	{
	  "Version": "2012-10-17",
	  "Statement": [
	    {
	      "Action": [
	        "sns:Publish"
	      ],
	      "Resource": [
	        <SNS topic ARN goes here>
	      ],
	      "Effect": "Allow"
	    }
	  ]
	}

* In your GitHub repository, add a "Service" to publish to AmazonSNS. Use the credentials from step 2 above and the full ARN name of the SNS topic.
* Create the Lambda Function in AWS, using "SNS Message" as the code template and "Basic Execution Role" (we'll edit this later). Choose the SNS topic you created previously in the drop-down, and the ARN will be populated for you.
* In the SNS console, find your Topic and under "Other Topic Actions" choose "Delivery Status". A wizard there will help you set up CloudWatch logging for this code. You can test the wiring at this point to make sure Github messages get all the way through to the log by clicking the "Test Service" button on your GitHub Webhooks screen.
* Create GitHub credentials for your bot using a "personal access token". For safety's sake, limit the details your bot needs; repo and public_repo are probably all you need, but if you add features (e.g. tag / deployment management, commenting, issue management, etc.) be sure to update the permissions here to grant your script the right levels off access.
* Create a KMS encryption key in your AWS console. This key will be used to encrypt and decrypt secrets that your bot will have access to. Be sure, under "Key Users", to add the Lambda Execution Role you made above.
* Using the GitHub access token and KMS key you just created, make a secret file called githubtoken.secret using the command below. (You will have to install and set up the AWS command line tools to do so.) This file will be decrypted by your script and will only be readable to your AWS account's roles.

	`aws kms encrypt --key-id "arn:aws:kms:blahblahblah" --plaintext "github-key-goes-here" --query "CiphertextBlob" --output text | base64 -D > ./githubtoken.secret`

* Edit the permissions for your Lambda execution role and your s3 bucket to allow getting, putting and deleting as follows:

#### Lambda IAM Role for Execution
	{
	    "Version": "2012-10-17",
	    "Statement": [
	        {
	            "Effect": "Allow",
	            "Action": [
	                "logs:CreateLogGroup",
	                "logs:CreateLogStream",
	                "logs:PutLogEvents"
	            ],
	            "Resource": "arn:aws:logs:*:*:*"
	        },
	        {
	            "Effect": "Allow",
	            "Action": [
	                "kms:Decrypt",
	                "kms:DescribeKey",
	                "kms:GetKeyPolicy"
	            ],
	            "Resource": "*"
	        },
	        {
            	"Effect": "Allow",
            	"Action": [
            	    "s3:GetObject",
            	    "s3:PutObject",
            	    "s3:DeleteObject"
            	],
            	"Resource": "arn:aws:s3:::your-bucket-name/"
        	}
	    ]
	}

#### S3 Permissions to allow storage / deletion
	{
	"Version": "2012-10-17",
	"Id": "LambdaPermissions",
	"Statement": [
		{
			"Sid": "AllowLambdaMgmt",
			"Effect": "Allow",
			"Principal": {
				"AWS": "arn:aws:iam::your-lambda-role-id-here"
			},
			"Action": [
				"s3:DeleteObject",
				"s3:GetObject",
				"s3:PutObject"
			],
			"Resource": "arn:aws:s3:::your-bucket-name/*"
		},
		{other permissions you may already have on this bucket}
		]
	}

* In index.js, change the value in s3bucket to the bucket you want to save your code into. [I'd like to move this to the secrets file for simplicity; see "To-do", below.]
* *Finally*, you can deploy the code. On a command line, `cd` into your directory and type `zip -r archive.zip .`, then go to the "Code" tab for your Lambda Function in AWS and upload the zip file you just created.
* You can test execution by making a simple push to your repo, or by using the "Test Service" button in GitHub's Webhooks panel. Testing will resend the last message your repo received, which may or may not be a push depending on your situation. See the CloudWatch logs for more specific information.

## Warnings
* The `index.js` file must be called that; this is the file that AWS looks for for its `index.handler` call. Changing that name is an exercise left to the reader, as it requires updating several configurations throughout AWS and is probably not worth the effort.
* Use `npm` to install more modules into your project should you need them. AWS has very few preinstalled modules (AWS being one of them, thankfully). Your `node_modules` directory will always need to be a part of the archive you upload to AWS.


## To-do
* Figure out MIME types and base64 encoding :white_check_mark:
* Make the Files loop asynchronous-safe :white_check_mark:
* Validate more end-to-end cases, including accepting pull requests
* Clean up documentation a bit to see if this Rube Goldberg wiring can be made more straightforward and understandable
* Improve / Expand the secrets file framework to have a JSON-oriented structure and multiple secrets / data points

