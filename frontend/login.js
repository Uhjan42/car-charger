const submitLogin = async function(){
	let response = await fetch('/login', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json;charset=utf-8'
		},
		body: JSON.stringify({password: document.querySelector("#tf-password").value})
	});
	if (response.ok) { // if HTTP-status is 200-299
		window.location = "/admin";
	} else {
		alert("Das Passwort ist nicht korrekt!");
	}
};