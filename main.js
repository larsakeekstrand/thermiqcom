/*
** This small program spawns an external script to run Thermiq poller to read
** data from a Thermiq card connected to a Thermia heatpump. It then presents
** the data as a modbus TCP server on port 502.
** Some of the parameters are also posted using mqtt
*/
var moment = require('moment');
var mqtt = require('mqtt'),
	client = mqtt.createSecureClient(8883,"mqtt.leapy.se");
var FC = require('modbus-stack').FUNCTION_CODES;

var paramtext = ["outdoor_temp", "indoor_temp", "indoor_temp_dec", "indoor_target_temp", "indoor_target_temp_dec", "supplyline_temp",
             "returnline_temp", "hotwater_temp", "brine_out_temp", "brine_in_temp", "cooling_temp", "supplyline_temp_shunt",
						 "electrical_current", "aux_heaters_reg", "supplyline_target_temp", "supplyline_target_temp_shunt"];
var now;
/*
 * Constants
 */
var POLLTIME = 30000; //ms
var MODBUS_PORT = 1502;
//var HP_COMMAND = "hp/hp_mockup.sh";
var HP_COMMAND = "hp/spawn_hp.sh";
var EXPECTED_PARAM_LENGTH = 118;

/*
 * Variables
 */
var i=0;
var handlers = {};
var input_register = [];

/*
 * Handler for input registers
 */
handlers[FC.READ_INPUT_REGISTERS] = function(request, response) {
	var start = request.startAddress;
	var length = request.quantity;

	var resp = new Array(length);
	for (var i=0; i<length; i++) {
		resp[i] = input_register[start+i];
	}

	response.writeResponse(resp);
}

/*
 * Start modbus server
 */
require('modbus-stack/server').createServer(handlers).listen(MODBUS_PORT);

/*
** Function to run an external command
*/
function run_cmd(cmd, args, callBack ) {
    var spawn = require('child_process').spawn;
    var child = spawn(cmd, args);
    var resp = "";

    child.stdout.on('data', function (buffer) { resp += buffer.toString() });
    child.stdout.on('end', function() { callBack (resp) });
} // ()

/*
** Interval timer event to ask for heatpump data
*/
setInterval(function() {
   run_cmd(HP_COMMAND,[""], function(text) {
   //run_cmd("hp/spawn_hp.sh",[""], function(text) {

			/*
			* Create timestamp in EPOCH
			*/
			now = moment().utc();

      /*
      ** The output is a long string of param=value separated by &.
      ** Let's first split it into separate param=value fields
      */
      var params = text.split("&");

			if (params.length !== 118)
				return;

			/*
      ** Now, let's split param from value
      */
      var split;
      for(i=0;i<params.length;i++) { //change count to params.length for full list
         split = params[i].split("=");

         /*
          * Load the value into a input register array
          */
         input_register[i] = split[1];

         /*
          * Post the data to a MQTT broker
          */
         if(i<15) {
        	 client.publish('/lsp/rpi001/thermia/metric/'+paramtext[i], '{"time":'+now+',"value":'+split[1]+'}', {retain: false});
         }


      }
   });
}, POLLTIME);
