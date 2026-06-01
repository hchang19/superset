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

import sanitizeTitle from './sanitizeTitle';

test('strips <script> tags and extracts text only', () => {
  const result = sanitizeTitle('<script>alert(1)</script>');
  expect(result).not.toContain('<script>');
  expect(result).not.toContain('</script>');
});

test('strips <img> tag with onerror', () => {
  const result = sanitizeTitle('<img src=x onerror=alert(document.cookie)>');
  expect(result).not.toContain('<img');
  expect(result).not.toContain('onerror');
});

test('strips nested XSS payload preserving surrounding text', () => {
  const result = sanitizeTitle('My Chart<script>alert("xss")</script>');
  expect(result).toContain('My Chart');
  expect(result).not.toContain('<script>');
});

test('preserves plain text', () => {
  expect(sanitizeTitle('Revenue by Region')).toBe('Revenue by Region');
});

test('preserves ampersands', () => {
  expect(sanitizeTitle('Tom & Jerry')).toBe('Tom & Jerry');
});

test('preserves quotes', () => {
  expect(sanitizeTitle('Chart "Alpha"')).toBe('Chart "Alpha"');
});

test('preserves angle brackets not forming tags', () => {
  expect(sanitizeTitle('x < 100')).toBe('x < 100');
});

test('returns empty string for empty input', () => {
  expect(sanitizeTitle('')).toBe('');
});
