import test from "ava";

import { Config } from "./config-utils";
import { printPathFiltersWarning } from "./init";
import { Language } from "./languages";
import { LoggedMessage, getRecordingLogger, setupTests } from "./testing-utils";

setupTests(test);

test("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are undefined", async (t) => {
  const messages: LoggedMessage[] = [];
  printPathFiltersWarning(
    {
      languages: [Language.cpp],
      originalUserInput: {},
    } as Partial<Config> as Config,
    getRecordingLogger(messages),
  );
  t.is(messages.length, 0);
});

test("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are empty", async (t) => {
  const messages: LoggedMessage[] = [];
  printPathFiltersWarning(
    {
      languages: [Language.cpp],
      originalUserInput: { paths: [], "paths-ignore": [] },
    } as Partial<Config> as Config,
    getRecordingLogger(messages),
  );
  t.is(messages.length, 0);
});
