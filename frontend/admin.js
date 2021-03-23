let config = {};

const loadStatus = async function(){
	let response = await fetch('/get-status');
	const status = await response.json();

	document.querySelector("#td-load").innerHTML = status.load;
	if (status.purchase){
		document.querySelector("#td-purchase").innerHTML = status.grid;
		document.querySelector("#td-feedin").innerHTML = "0";
	}
	if (status.feedIn){
		document.querySelector("#td-purchase").innerHTML = "0";
		document.querySelector("#td-feedin").innerHTML = status.grid;
	}

	document.querySelector("#td-pv").innerHTML = status.pv;
	document.querySelector("#td-loadstorage").innerHTML = status.loadStorage;
	document.querySelector("#td-storage").innerHTML = status.storage;
	document.querySelector("#td-balance").innerHTML = status.balance;
	document.querySelector("#td-loadingcar").innerHTML = status.loadingCarInKw;

	response = await fetch('/get-config');
	config = await response.json();
	document.querySelector("#td-apikey").value = config.apiKey;
	document.querySelector("#td-siteid").value = config.siteId;
	document.querySelector("#td-nrg-ip").value = config.nrg.ip;
	document.querySelector("#td-nrg-password").value = config.nrg.password;
	document.querySelector("#td-feedinthreshold").value = config.feedInThreshold;
	document.querySelector("#td-reservepower").value = config.reservePower;
	document.querySelector("#td-batterythreshold").value = config.batteryThreshold;
	document.querySelector("#td-leastloading").value = config.atLeastloadingInMinutes;
	document.querySelector("#td-mincurrent").value = config.minCurrent;
	document.querySelector("#td-maxcurrent").value = config.maxCurrent;
	document.querySelector(`#r-loading${config.loading}`).click();
	document.querySelector(`#r-threephases${(config.threePhases?'yes':'no')}`).click();

};

const savePassword = async function(){

	if (document.querySelector("#tf-password").value === document.querySelector("#tf-password-confirm").value){
		let response = await fetch('/set-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json;charset=utf-8'
			},
			body: JSON.stringify({password: document.querySelector("#tf-password").value})
		});
	}else{
		alert("Die beiden Eingaben stimmen nicht überein!");
	}
	
};

const saveConfig = async function(){

	config.apiKey = document.querySelector("#td-apikey").value;
	config.siteId = document.querySelector("#td-siteid").value;
	config.nrg.ip = document.querySelector("#td-nrg-ip").value;
	config.nrg.password = document.querySelector("#td-nrg-password").value;
	config.feedInThreshold = parseFloat(document.querySelector("#td-feedinthreshold").value);
	config.reservePower = parseFloat(document.querySelector("#td-reservepower").value);
	config.batteryThreshold = parseInt(document.querySelector("#td-batterythreshold").value);
	config.atLeastloadingInMinutes = parseInt(document.querySelector("#td-leastloading").value);
	config.minCurrent = parseInt(document.querySelector("#td-mincurrent").value);
	config.maxCurrent = parseInt(document.querySelector("#td-maxcurrent").value);
	config.loading = document.querySelector('input[name=loading]:checked').value;
	config.threePhases = (document.querySelector('input[name=loading]:checked').value === "yes" ? true: false);

	let response = await fetch('/set-config', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json;charset=utf-8'
		},
		body: JSON.stringify({config})
	});

};