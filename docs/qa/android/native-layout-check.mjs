// Native phone classification is presentation-only; no native/auth permission.
import assert from "node:assert/strict";
import { isNativeAndroidPhone, nativeAndroidPhoneLayout } from "../../../src/utils/responsivePolicy.mjs";

const userAgent = "Mozilla/5.0 (Linux; Android 13; wv) Mobile HayKasaAndroid/1.0.2";
const phone = { userAgent, width: 802, height: 345, screenWidth: 393, screenHeight: 852 };
assert.equal(nativeAndroidPhoneLayout(phone), true, "Rotating a native phone retains its phone layout even with a fine pointer");
assert.equal(nativeAndroidPhoneLayout({ ...phone, width: 393, height: 778 }), true);
assert.equal(nativeAndroidPhoneLayout({ ...phone, width: 1000, height: 575, screenWidth: 575, screenHeight: 1000 }), true);
assert.equal(nativeAndroidPhoneLayout({ ...phone, width: 1300 }), false, "An expanded wide workspace is not forced into phone mode");
assert.equal(nativeAndroidPhoneLayout({ ...phone, width: 802, height: 700 }), false);
for (const override of [
  { userAgent: "Mozilla/5.0 Windows Chrome/140" },
  { userAgent: "Mozilla/5.0 Android 13 Mobile Chrome/140" },
  { userAgent: "Mozilla/5.0 Android 13 HayKasaAndroid/1.0.2" },
  { screenWidth: 800, screenHeight: 1280 },
  { screenWidth: 1080, screenHeight: 1920 },
  { width: 0 }, { height: 0 }, { width: -1 }, { height: Number.NaN },
]) assert.equal(nativeAndroidPhoneLayout({ ...phone, ...override }), false, `Non-phone/invalid state remains unchanged: ${JSON.stringify(override)}`);
assert.equal(isNativeAndroidPhone({ ...phone, screenWidth: 800, screenHeight: 1280, height: 300 }), false, "A tablet keyboard/short split window cannot create phone identity");
assert.equal(isNativeAndroidPhone({ ...phone, screenWidth: 0, screenHeight: 0 }), true, "Older WebView screen APIs may fall back to the viewport");
assert.equal(isNativeAndroidPhone(), false);
console.log("PASS: native Android phone rotation, fine pointer, tablet/desktop/browser exclusions and invalid viewport bounds");
