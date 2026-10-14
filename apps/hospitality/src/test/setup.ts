/// <reference types="@testing-library/jest-dom/vitest" />
import { expect } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";

expect.extend(jestDomMatchers);

// Initialise the app's i18next instance so components render en-US text in tests.
import "../i18n/runtime.js";
