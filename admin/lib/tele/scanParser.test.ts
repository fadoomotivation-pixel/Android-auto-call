// Mirrors ScanListParserTest.kt + ScanListParserOcrTest.kt. Run: npm run test:scan
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixOcrDigits, joinSplit, key, normalize, parse, parseLines } from "./scanParser";

const phones = (t: string) => parse(t).filter((r) => r.valid).map((r) => r.phone);
const dedent = (s: string) => s.split("\n").map((l) => l.trim()).filter((l, i, a) => !(l === "" && (i === 0 || i === a.length - 1))).join("\n");

test("messy lens text", () => {
  const r = parse(dedent(`
    Rakesh Sharma  98290 41237
    Priya Verma - 9928015562
    Amit Gupta +91 97845-22310
    Sunita Yadav 094140 77821
    Plot 585 Shree Kunj 10:30
    Manoj  98290 41237
    Neha 88750 3321
    Deepak Jain
    7014790988
  `));
  assert.equal(r.length, 7);
  assert.equal(r[0].name, "Rakesh Sharma"); assert.equal(r[0].phone, "9829041237"); assert.ok(r[0].valid);
  assert.equal(r[1].name, "Priya Verma"); assert.equal(r[1].phone, "9928015562");
  assert.equal(r[2].phone, "9784522310");
  assert.equal(r[3].phone, "9414077821");
  assert.ok(r[4].duplicate); assert.equal(r[4].name, "Manoj");
  assert.ok(!r[5].valid); assert.equal(r[5].name, "Neha");
  assert.equal(r[6].name, "Deepak Jain"); assert.equal(r[6].phone, "7014790988");
});

test("whatsapp forward", () => {
  const r = parse(dedent(`
    [17/10, 10:32 am] Ravi Kumar: Forwarded
    [17/10, 10:32 am] Ravi Kumar: Name: Rakesh, Mob: 9829041237
    17/10/26, 10:33 am - Ravi Kumar: Priya 99280-15562
    ~ Amit Gupta +919784522310
    1. Sunita 9414077821, 2. Manoj 5123456789
  `));
  assert.equal(r[0].name, "Rakesh"); assert.equal(r[0].phone, "9829041237");
  assert.equal(r[1].name, "Priya");
  assert.equal(r[2].name, "Amit Gupta"); assert.equal(r[2].phone, "9784522310");
  assert.equal(r[3].phone, "9414077821");
  assert.ok(!r[4].valid);
  assert.equal(r.length, 5);
});

test("table numbers first", () => {
  const r = parse(dedent(`
    Mobile        Name           Location
    9829041237    Rakesh Sharma  Jaipur
    9928015562    Priya Verma    Ajmer
    9829041237    Rakesh S       Jaipur
  `));
  assert.equal(r.length, 3);
  assert.equal(r[0].name, "Rakesh Sharma Jaipur");
  assert.equal(r[1].phone, "9928015562");
  assert.ok(r[2].duplicate);
  assert.ok(!r[0].duplicate);
});

test("glued pair and no name", () => {
  const r = parse("98290412379928015562");
  assert.deepEqual(r.map((x) => x.phone), ["9829041237", "9928015562"]);
  assert.equal(r[0].name, null);
});

test("normalize and key", () => {
  assert.equal(normalize("+91 98290 41237"), "9829041237");
  assert.equal(normalize("09829041237"), "9829041237");
  assert.equal(normalize("1829041237"), null);
  assert.equal(normalize("98290412"), null);
  assert.equal(key("+919829041237"), "9829041237");
});

test("prefixes and separators", () => {
  assert.deepEqual(phones(dedent(`
    A +91 98290 41237
    B 091-9928015562
    C 0 97845 22310
    D 94140.77821
    E 91-7014-790-988
    F (+91) 88750-33210
  `)), ["9829041237", "9928015562", "9784522310", "9414077821", "7014790988", "8875033210"]);
});

test("ocr lookalikes inside numbers", () => {
  assert.deepEqual(phones("Rakesh 98290 4l237"), ["9829041237"]);
  assert.deepEqual(phones("Priya 99280 I5562"), ["9928015562"]);
  assert.deepEqual(phones("Amit 9784S22310"), ["9784522310"]);
  assert.deepEqual(phones("Sunita 94l4O77821"), ["9414077821"]);
  assert.deepEqual(phones("Neha B875033210"), ["8875033210"]);
});

test("lookalike fix does not touch words", () => {
  assert.equal(fixOcrDigits("Sunil BOSS 10:30"), "Sunil BOSS 10:30");
  assert.equal(fixOcrDigits("Plot SB-12 3BHK"), "Plot SB-12 3BHK");
  assert.equal(parse("Sushil Bansal 9829041237")[0].name, "Sushil Bansal");
});

test("number split across lines", () => {
  const r = parseLines(["Rakesh Sharma 98290", "41237", "Priya 9928015562"]);
  assert.deepEqual(r.filter((x) => x.valid).map((x) => x.phone), ["9829041237", "9928015562"]);
  assert.equal(r[0].name, "Rakesh Sharma");
  assert.equal(r[0].line, 0);
  assert.equal(r[1].line, 2);
});

test("split join keeps line count", () => {
  assert.equal(joinSplit(["Ravi 98290", "41237 Jaipur", "x"]).length, 3);
});

test("only valid indian mobiles", () => {
  const r = parse("A 5123456789\nB 01412345678\nC 98290412\nD 9829041237");
  assert.deepEqual(r.filter((x) => x.valid).map((x) => x.phone), ["9829041237"]);
  assert.ok(r.some((x) => !x.valid));
});

test("dedupe across formats", () => {
  const r = parse("A +91 98290 41237\nB 09829041237\nC 98290-41237");
  assert.equal(r.length, 3);
  assert.ok(!r[0].duplicate); assert.ok(r[1].duplicate); assert.ok(r[2].duplicate);
});

test("normalize edge cases", () => {
  assert.equal(normalize("+91 98290 41237"), "9829041237");
  assert.equal(normalize("06000000001"), "6000000001");
  assert.equal(normalize("5829041237"), null);
  assert.equal(normalize("982904123"), null);
});
