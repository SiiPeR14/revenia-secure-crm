import assert from "node:assert/strict";

const base = "http://localhost:3000";
const anonymous = await fetch(`${base}/dashboard`, {redirect:"manual"});
assert.equal(anonymous.status,307);
assert.equal(anonymous.headers.get("location"),"/login");
const blocked = await fetch(`${base}/api/auth/login`, {method:"POST",headers:{Origin:"https://untrusted.example","Content-Type":"application/json"},body:"{}"});
assert.equal(blocked.status,403);
const login = await fetch(`${base}/api/auth/login`, {method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({email:process.env.DEV_OWNER_EMAIL ?? "owner@revenia.local",password:process.env.DEV_OWNER_PASSWORD ?? "ReveniaDemo!2026"})});
assert.equal(login.status,200);
const setCookie = login.headers.get("set-cookie")!;
assert.match(setCookie,/HttpOnly/i);
assert.match(setCookie,/SameSite=Strict/i);
const cookie = setCookie.split(";")[0]!;
try {
  assert.equal((await fetch(`${base}/dashboard`,{headers:{Cookie:cookie},redirect:"manual"})).status,200);
  const logout = await fetch(`${base}/api/auth/logout`,{method:"POST",headers:{Origin:base,Cookie:cookie}});
  assert.equal(logout.status,200);
  const replay = await fetch(`${base}/dashboard`,{headers:{Cookie:cookie},redirect:"manual"});
  assert.equal(replay.status,307,"A revoked session must not be reusable");
  assert.equal(replay.headers.get("location"),"/login");
  console.log("HTTP checks passed: anonymous access, hostile origin, login, cookie flags, authenticated access, logout and token replay blocked.");
} finally {
  await fetch(`${base}/api/auth/logout`,{method:"POST",headers:{Origin:base,Cookie:cookie}});
}
