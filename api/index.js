let appPromise;

function getApp() {
	if (!appPromise) appPromise = import("../server/app.js").then((module) => module.default);
	return appPromise;
}

module.exports = async (req, res) => {
	const app = await getApp();
	return app(req, res);
};