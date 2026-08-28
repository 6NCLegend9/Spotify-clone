const base = (process.env.SMOKE_TEST_URL || "http://localhost:5000").replace(/\/$/, "");
for (const path of ["/api", "/api/health", "/api/tracks"]) {
  const response = await fetch(base + path);
  console.log(`${response.ok ? "PASS" : "FAIL"} ${path} -> ${response.status}`);
  if (!response.ok) process.exitCode = 1;
}
