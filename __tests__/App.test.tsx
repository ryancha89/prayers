/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

// The mini player sat on CounselingSubject's "Continue" (sim 13-10): forms with a bottom CTA keep it off,
// and a consultation's first step pauses the journey so a hidden bar never leaves narration running.
import { miniPlayerHiddenOn, pausesJourneyOn } from '../src/App';

test('the mini player stays off the consultation forms and the rooms', () => {
  for (const r of ['CounselingSubject', 'AddSubject', 'CounselingRoom', 'MeditationRoom', 'World', 'Journey']) {
    expect(miniPlayerHiddenOn(r)).toBe(true);
  }
  for (const r of ['Home', 'CounselorDetail', 'Archive']) expect(miniPlayerHiddenOn(r)).toBe(false);
});

test('a consultation pauses the journey from its first step', () => {
  expect(pausesJourneyOn('CounselingSubject')).toBe(true);
  expect(pausesJourneyOn('CounselingRoom')).toBe(true);
  expect(pausesJourneyOn('AddSubject')).toBe(false); // also reached from My page, where nothing starts
  expect(pausesJourneyOn('Home')).toBe(false);
});
