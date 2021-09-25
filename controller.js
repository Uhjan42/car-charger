const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const https = require('https');
const http = require('http');
const TESTMODE = true;


let lastLoadingStart = null;
let PVData = {};
let nrgDevice = {};
let nrgMeasurements= {};
let loadingCarInKw = 0 ;
let startedFromHere = false;
let firstOffChance = true;

const getConfig = async function(){
	const data = await readFile(__dirname + '/config.json', 'utf8');
	return JSON.parse(data);
}

const power2current = function(powerKw, threePhases){
	if (threePhases){
		return Math.floor((powerKw*1000)/(3*225));
	}else{		
		return Math.floor((powerKw*1000)/225);
	}
}

const readStatus = async function(){

	// We only check between 9:00 and 21:00 (every 3 minutes)
	let d = new Date();
	if (d.getHours() < 9 || d.getHours() > 20) return;

	try{

		PVData = {};
		
		const config = await getConfig();
	
		const responseJson = await getSolarEdgeData(config.apiKey, config.siteId);
	
		let connections = responseJson.siteCurrentPowerFlow.connections;  
		PVData.purchase = connections.some((c)=> c.from.toLowerCase() === "grid" && c.to.toLowerCase() === "load");
		PVData.feedIn = connections.some((c)=> c.from.toLowerCase() === "load" && c.to.toLowerCase() === "grid");
		PVData.storageIn = connections.some((c)=> c.to.toLowerCase() === "storage");
		PVData.grid = responseJson.siteCurrentPowerFlow.GRID.currentPower;
		PVData.load = responseJson.siteCurrentPowerFlow.LOAD.currentPower;
		PVData.pv = responseJson.siteCurrentPowerFlow.PV.currentPower;
		PVData.loadStorage = (PVData.storageIn ? responseJson.siteCurrentPowerFlow.STORAGE.currentPower : 0 - responseJson.siteCurrentPowerFlow.STORAGE.currentPower);
		PVData.storage = responseJson.siteCurrentPowerFlow.STORAGE.chargeLevel;

		if (!TESTMODE){
			nrgMeasurements = await getNrgDeviceMeasurements();
			console.log(JSON.stringify(nrgMeasurements));
			loadingCarInKw = nrgMeasurements.ChargingPower;
			//loadingCarInKw = 0;
		}
		

		let balance = 0;

		if (PVData.feedIn){
			balance += PVData.grid;
		}else{
			balance -= PVData.grid;
		}

		if (!TESTMODE){
			balance += loadingCarInKw;
		}
		balance += (PVData.loadStorage); 
		PVData.balance = balance;
	
		if ( 
				( balance >= config.feedInThreshold 
					&& config.loading === "auto"
					&& PVData.storage >= config.batteryThreshold
				) 
				|| (config.loading === "on" && loadingCarInKw === 0)
			){
			//start loading with NRGKick API
			if (config.loading === "on"){
				loadingCarInKw = config.feedInThreshold - config.reservePower;
			}else{
				loadingCarInKw = (balance - config.reservePower);
			}
			console.log("schalte ein: " + (loadingCarInKw) + "kw, " + power2current(balance-config.reservePower, config.threePhases) +  "A" );		
			await switchLoading(true, power2current(balance-config.reservePower, config.threePhases)); //Wir laden mit dem Überschuss abzüglich der Reserve

			if (!lastLoadingStart){
				lastLoadingStart = new Date().getTime();
			}
			
			startedFromHere = true;
			firstOffChance = false;
		}

		let now = new Date().getTime();

		if ( 
				( loadingCarInKw > 0 
					&& (startedFromHere || config.alwaysOffAuto)
					&& firstOffChance
					&& (balance < config.feedInThreshold || PVData.storage < config.batteryThreshold )
					&& config.loading === "auto" 
					&& ((now - (lastLoadingStart ? lastLoadingStart : now)) / 60000) > config.atLeastloadingInMinutes
				)	
				|| (config.loading === "off" && loadingCarInKw > 0)			
				 
			){
			//stop loading with NRGKick API
			console.log("schalte aus");
			lastLoadingStart = null;
			await switchLoading(false, 0);
			startedFromHere = false;
			if (TESTMODE){
				loadingCarInKw = 0;
			}
		}else if (balance < config.feedInThreshold && loadingCarInKw > 0){
			firstOffChance = true;
		}

		PVData.loadingCarInKw = loadingCarInKw;

		console.log(JSON.stringify(PVData));	

	}catch(err){

		console.error(err.message);

	}
	
}

const getSolarEdgeData = function(apiKey, siteId){
	return getRequest(`https://monitoringapi.solaredge.com/site/${siteId}/currentPowerFlow?api_key=${apiKey}`);
};

const getNrgDevice = async function(){
	const config = await getConfig();
	const dataNRG = await getRequest(`http://${config.nrg.ip}/api/devices`);
	return dataNRG[0];
};

const getNrgDeviceMeasurements = async function(){
	const config = await getConfig();

	if (typeof nrgDevice.MacAddress === 'undefined') {
		nrgDevice = await getNrgDevice();
	}

	const dataNRG = await getRequest(`http://${config.nrg.ip}/api/measurements/${nrgDevice.MacAddress}`);
	return dataNRG;
};

const switchLoading = async function(loading, current){

	if (!TESTMODE){
		const config = await getConfig();
		if (typeof nrgDevice.MacAddress === 'undefined') {
			nrgDevice = await getNrgDevice();
		}

		let saveCurrent = 0;

		if (!loading){
			saveCurrent = 0;
		}
		if (current > config.maxCurrent){
			saveCurrent = config.maxCurrent;
		}else if(current < config.minCurrent){
			saveCurrent = config.minCurrent;
		}else{
			saveCurrent = current;
		}

		const settings = {
			"Values": {
				"ChargingStatus": {
					"Charging": loading
				},
				"DeviceMetadata": {
					"Password": config.nrg.password
				},
				"ChargingCurrent": {
					"Value": saveCurrent
				}
			}
		};

		await postRequest(config.nrg.ip, `/api/settings/${nrgDevice.MacAddress}`, settings);
	}
	return;
};

const getRequest = function (url) {
	return new Promise((resolve, reject) => {
		let responseString = "";
		let method = https;
		if (url.substr(0, 5) !== 'https'){
			method = http;
		}

		const req = method.get(url, (res) => {

			res.on('data', (d) => {
				responseString += d;
			});
			
			res.on('end', async () => {
				try{
					let responseJson = JSON.parse(responseString);
					resolve(responseJson);
				}
				catch(e){
					console.error(e.message + " " + responseJson);
				}
				
			});

			res.on('error', async (e) => {		
				console.error(e.message);
				reject(e);
			});

			res.on('timeout', async () => {		
				reject("Timeout");
			});
	
		}).on('error', (e) => {
			reject(e);
		});
		//req.setTimeout(5000, (s)=>{s.destroy();});

	});
}


const postRequest = function (apiHost, apiPath, dataObj) {
	const dataStr = JSON.stringify(dataObj);
	console.log(apiHost + apiPath + dataStr);
	var urlparams = {
			host: apiHost, //No need to include 'http://' or 'www.'
			port: 80,
			path: apiPath,
			method: 'PUT',
			headers: {
					'Content-Type': 'application/json', //Specifying to the server that we are sending JSON 
					'Content-Length': dataStr.length
			}
	};

	return new Promise((resolve, reject) => {

		const request = http.request(urlparams, (res) => {
			res.on('error', async (err) => {				
				console.error(err.message);
			});

			res.on('timeout', async () => {
				console.error('timeout');
			});
		}).on('error', (err) => {
			reject(err);
		});


	//request.setTimeout(5000, (s)=>{s.destroy();});		
    request.write(dataStr); //Send off the request.
    request.end(); //End the request.
		resolve("OK");
	});
}

const start = async function(){

	readStatus();
	const interval = setInterval(readStatus, 180000);

	if (!TESTMODE){
		nrgDevice = await getNrgDevice();
		console.log(JSON.stringify(nrgDevice));
	}
};
start();

exports.getPVData = function() {
  return PVData;
}

exports.callRefresh = async function() {
  await readStatus();
	return;
}
