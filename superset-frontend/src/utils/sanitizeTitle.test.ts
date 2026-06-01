/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { sanitizeTitle } from './sanitizeTitle';

describe('sanitizeTitle', () => {
  test('strips script tags from titles', () => {
    expect(sanitizeTitle('<script>alert(1)</script>')).toBe('alert(1)');
  });

  test('strips img onerror payloads', () => {
    expect(sanitizeTitle('<img src=x onerror=alert(document.cookie)>')).toBe(
      '',
    );
  });

  test('strips nested/complex HTML tags', () => {
    expect(
      sanitizeTitle('My <b>Bold</b> <script>alert("xss")</script> Title'),
    ).toBe('My Bold alert("xss") Title');
  });

  test('preserves legitimate special characters', () => {
    expect(sanitizeTitle('Revenue & Profit')).toBe('Revenue & Profit');
    expect(sanitizeTitle('Q1 "Results"')).toBe('Q1 "Results"');
    expect(sanitizeTitle("Year's Summary")).toBe("Year's Summary");
    expect(sanitizeTitle('A < B > C')).toBe('A  C');
  });

  test('returns plain text titles unchanged', () => {
    expect(sanitizeTitle('My Dashboard')).toBe('My Dashboard');
    expect(sanitizeTitle('')).toBe('');
  });

  test('strips self-closing tags', () => {
    expect(sanitizeTitle('Title<br/>Subtitle')).toBe('TitleSubtitle');
    expect(sanitizeTitle('Title<hr />')).toBe('Title');
  });
});
