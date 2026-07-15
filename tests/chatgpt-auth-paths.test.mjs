import assert from "node:assert/strict";
import test from "node:test";

import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
} from "../app/chatgpt-auth-paths.ts";

test("ChatGPT auth paths retain safe local return destinations", () => {
  assert.equal(
    chatGPTSignInPath("/projects/project-1?view=tasks#item-2"),
    "/signin-with-chatgpt?return_to=%2Fprojects%2Fproject-1%3Fview%3Dtasks%23item-2",
  );
  assert.equal(chatGPTSignOutPath("/events"), "/signout-with-chatgpt?return_to=%2Fevents");
});

test("ChatGPT auth paths reject external and reserved return destinations", () => {
  assert.equal(chatGPTSignInPath("https://example.com"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignInPath("//example.com"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(
    chatGPTSignOutPath("/callback?code=secret"),
    "/signout-with-chatgpt?return_to=%2F",
  );
});
