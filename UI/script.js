async function updateStatus() {

  try {

    const response = await fetch(
      "http://localhost:3005/status"
    );

    if (response.ok) {
      console.log("Status Service Online");
    }

  } catch (error) {

    console.log("Status Service Offline");

  }

}

updateStatus();

setInterval(updateStatus, 10000);