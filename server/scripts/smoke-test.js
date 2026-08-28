const baseUrl = (process.env.SMOKE_TEST_URL || "http://localhost:5000").replace(
  /\/$/,
  ""
);
const { mailConfigured, verifyMail } = await import("../mail/mail.js");

const checks = [
  { path: "/api", expected: 200 },
  { path: "/api/music/home", expected: 200 },
  { path: "/api/music/search?type=artist&search=Daft%20Punk", expected: 200 },
  { path: "/api/user/checkLogged", expected: 405 },
];

let failed = false;

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`);
    const result = response.status === check.expected ? "PASS" : "FAIL";
    console.log(`${result} ${check.path} -> ${response.status}`);
    if (result === "FAIL") {
      failed = true;
    }
  } catch (error) {
    failed = true;
    console.log(`FAIL ${check.path} -> ${error.message}`);
  }
}

if (mailConfigured) {
  try {
    await verifyMail();
    console.log("PASS SMTP configuration verified");
  } catch (error) {
    failed = true;
    console.log(`FAIL SMTP configuration -> ${error.message}`);
  }
} else {
  console.log("SKIP SMTP configuration is not set");
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("All smoke tests passed.");
}
