import assert from "node:assert/strict";
import test from "node:test";
import { parseFeatureFlag, hrFeatures } from "../config/hrFeatures.js";
import { requireWorkScheduleEnabled, workScheduleDisabledResponse } from "./hrFeatureGuards.js";

test("Escala permanece desabilitada por padrao e exige valor true explicito", () => {
  assert.equal(parseFeatureFlag(undefined), false);
  assert.equal(parseFeatureFlag("false"), false);
  assert.equal(parseFeatureFlag("TRUE"), true);
});

test("middleware bloqueia a Escala com resposta controlada", async () => {
  const previous = process.env.HR_WORK_SCHEDULE_ENABLED;
  delete process.env.HR_WORK_SCHEDULE_ENABLED;
  let statusCode = 0;
  let payload: unknown;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      payload = body;
      return this;
    }
  };

  try {
    assert.equal(hrFeatures.workScheduleEnabled, false);
    await requireWorkScheduleEnabled({} as never, reply as never);
    assert.equal(statusCode, 503);
    assert.deepEqual(payload, workScheduleDisabledResponse);
  } finally {
    if (previous === undefined) delete process.env.HR_WORK_SCHEDULE_ENABLED;
    else process.env.HR_WORK_SCHEDULE_ENABLED = previous;
  }
});
