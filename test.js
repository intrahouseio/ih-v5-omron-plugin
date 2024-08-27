const fins = require('omron-fins');
const util = require('util')
const options = {timeout: 5000, max_queue:2, protocol: 'tcp'};
const client = fins.FinsClient(9600,'127.0.0.1',options, true);
client.connect({"host": "127.0.0.1", "port": 9600, "protocol": "tcp", "timeout": 3000, max_queue:3});
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Setting up our error listener
client.on('error',function(error, msg) {

  console.log("Error: ", error, msg);
});
// Setting up our error listener
client.on('open',async function(info) {
    console.log("Open: ", info);
    //console.log("clietn "  + util.inspect(client))
    await sleep(2000);
  });
// Setting up our timeout listener
client.on('timeout',function(host, msg) {
  console.log("Timeout: ", host);
});

// Setting up the general response listener showing a selection of properties from the `msg`
client.on('reply',function(msg) {
  console.log("############# client.on('reply'...) #################")
	console.log("Reply from           : ", msg.response.remoteHost);
	console.log("Sequence ID (SID)    : ", msg.sid);
	console.log("Operation requested  : ", msg.request.functionName);
	console.log("Response code        : ", msg.response.endCode);
	console.log("Response desc        : ", msg.response.endCodeDescription);
	console.log("Data returned        : ", msg.response.values || "");
	console.log("Round trip time      : ", msg.timeTaken + "ms");
	console.log("Your tag             : ", msg.tag);
  console.log("#####################################################")
});



var cb = function(err, msg) {
    console.log("################ DIRECT CALLBACK ####################")
    if(err)
      console.error(err);
    else
        console.log(msg.request.functionName, msg.tag || "", msg.response.endCodeDescription);
      console.log("#####################################################")
  };

  setInterval(() => {
    console.log("Request PLC change to RUN mode...")
    client.readMultiple(["D0", "D1", "D2"],null, ["D0","D1","D2"]);
  }, 2000);