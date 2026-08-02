// Entry-point shim.
//
// Hostinger's Node app (and most Passenger-style hosts) look for app.js at the
// application root and start it directly, rather than running `npm start`. The
// real server is src/server.js; this exists only so the host finds it without
// anyone having to remember to change a startup command in a panel.
import "./src/server.js";
