import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeInput, formatDuration, isoDate } from '../src/parser.js';

// Fast "nu": torsdag 2026-10-29 kl 10:00
const now = new Date(2026, 9, 29, 10, 0, 0);

const cases = [
  ['idag 7:30-16:00', '2026-10-29', 510, '07:30', '16:00'],
  ['igår 7:30-16:00', '2026-10-28', 510, '07:30', '16:00'],
  ['i förrgår 06-14', '2026-10-27', 480, '06:00', '14:00'],
  ['måndag 7-16', '2026-10-26', 540, '07:00', '16:00'],
  ['förra fredagen 6 timmar', '2026-10-23', 360, null, null],
  ['12/5 7-15', '2026-05-12', 480, '07:00', '15:00'],
  ['2026-05-12 07:00-15:30', '2026-05-12', 510, '07:00', '15:30'],
  ['2h 30m', '2026-10-29', 150, null, null],
  ['1h30', '2026-10-29', 90, null, null],
  ['2,5 timmar', '2026-10-29', 150, null, null],
  ['en och en halv timme', '2026-10-29', 90, null, null],
  ['en halv timme', '2026-10-29', 30, null, null],
  ['halvtimme', '2026-10-29', 30, null, null],
  ['45 min', '2026-10-29', 45, null, null],
  ['kvart', '2026-10-29', 15, null, null],
  ['tre timmar', '2026-10-29', 180, null, null],
  ['2 timmar 30 minuter', '2026-10-29', 150, null, null],
  ['22-06', '2026-10-29', 480, '22:00', '06:00'],
  ['kl 07.00 till 16.30', '2026-10-29', 570, '07:00', '16:30'],
  ['på torsdag 8-12', '2026-10-29', 240, '08:00', '12:00'],
];

for (const [input, date, minutes, start, end] of cases) {
  test(`tolkar "${input}"`, () => {
    const parsed = parseTimeInput(input, { now });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.date, date);
    assert.equal(parsed.minutes, minutes);
    assert.equal(parsed.start, start);
    assert.equal(parsed.end, end);
  });
}

test('datum antas vara idag när inget anges', () => {
  const parsed = parseTimeInput('8h', { now });
  assert.equal(parsed.date, isoDate(now));
  assert.equal(parsed.dateInferred, true);
});

test('lunchtips när intervallet passerar lunch', () => {
  assert.equal(parseTimeInput('7-16', { now }).lunchHint, true);
  assert.equal(parseTimeInput('7-11', { now }).lunchHint, false);
  assert.equal(parseTimeInput('13-17', { now }).lunchHint, false);
});

test('ignorerar okänd text men behåller tiden', () => {
  const parsed = parseTimeInput('montering Storgatan 2h', { now });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.minutes, 120);
});

test('tomt eller otydligt ger ok=false', () => {
  assert.equal(parseTimeInput('', { now }).ok, false);
  assert.equal(parseTimeInput('montering', { now }).ok, false);
  assert.equal(parseTimeInput('någon gång', { now }).ok, false);
});

test('formaterar varaktighet', () => {
  assert.equal(formatDuration(510), '8 h 30 min');
  assert.equal(formatDuration(480), '8 h');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(0), '0 min');
});
